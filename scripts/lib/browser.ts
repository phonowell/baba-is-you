// lib/browser.ts — 无头浏览器工具链共享层：进程内静态服务 + 隔离
// profile 浏览器实例（DevToolsActivePort 端口自分配）+ CDP 直连客户端。
// cdp.ts 及后续探针共用——勿再手写第三份。
//
// 设计约束：
// - 不走 agent-browser——它绑日常 Edge 会被劫持回 MSN 起始页；独立二进制
//   + 独立 user-data-dir + headless=new（rAF 正常驱动）
// - 输入走 Input.dispatchMouseEvent/KeyEvent（真输入管线）
// - 只读 __babaProbe 状态与 Runtime.evaluate，不做截图比对（AGENTS 约束：
//   验收优先探针）
// - browser/server/tempdir 随调用方生命周期清理，不留孤儿

import { spawn, type ChildProcess } from 'node:child_process'
import { createServer, type Server } from 'node:http'
import { readFile, rm } from 'node:fs/promises'
import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.m4a': 'audio/mp4',
  '.wasm': 'application/wasm',
}

const BROWSERS = [
  process.env.BROWSER,
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/chromium',
  '/usr/bin/google-chrome',
].filter((p): p is string => !!p)

// ── 静态服务（进程内）──
export const serveDir = (root: string): Promise<Server> =>
  new Promise((res, rej) => {
    const s = createServer((rq, rs) => {
      // resolve + boundary check (not bare startsWith — a sibling like
      // `release-local-x` shares the prefix); decodeURIComponent throws on
      // malformed escapes, which must not kill the process.
      let p: string
      try {
        p = path.resolve(
          root,
          `.${decodeURIComponent(new URL(rq.url ?? '/', 'http://x').pathname)}`,
        )
      } catch {
        rs.writeHead(400)
        rs.end()
        return
      }
      if (p !== root && !p.startsWith(root + path.sep)) {
        rs.writeHead(403)
        rs.end()
        return
      }
      readFile(p)
        .then((b) => {
          rs.writeHead(200, {
            'content-type': MIME[path.extname(p)] ?? 'application/octet-stream',
          })
          rs.end(b)
        })
        .catch(() => {
          rs.writeHead(404)
          rs.end()
        })
    })
    s.listen(0, '127.0.0.1', () => res(s))
    s.on('error', rej)
  })

// ── CDP 客户端（Node>=22 内置 WebSocket；页级 target 直连）──
export class Cdp {
  private ws!: WebSocket // connect() 异步赋值——构造体无参
  private id = 0
  private pending = new Map<
    number,
    { res: (v: unknown) => void; rej: (e: Error) => void }
  >()

  static async connect(wsUrl: string): Promise<Cdp> {
    const c = new Cdp()
    c.ws = new WebSocket(wsUrl)
    await new Promise<void>((res, rej) => {
      c.ws.onopen = () => res()
      c.ws.onerror = () => rej(new Error('ws connect failed'))
    })
    c.ws.onmessage = (ev) => {
      const m = JSON.parse(String(ev.data))
      const p = c.pending.get(m.id)
      if (p) {
        c.pending.delete(m.id)
        if (m.error) p.rej(new Error(m.error.message))
        else p.res(m.result)
      }
    }
    // A dead socket must fail in-flight ops — ws.send on a closed socket
    // is silently dropped, so without this the CLI hangs forever.
    c.ws.onclose = () => {
      for (const p of c.pending.values()) p.rej(new Error('ws closed'))
      c.pending.clear()
    }
    return c
  }

  send<T = unknown>(
    method: string,
    params: Record<string, unknown> = {},
  ): Promise<T> {
    const id = ++this.id
    return new Promise<T>((res, rej) => {
      if (this.ws.readyState !== WebSocket.OPEN) {
        rej(new Error('ws not open'))
        return
      }
      this.pending.set(id, { res: res as (v: unknown) => void, rej })
      this.ws.send(JSON.stringify({ id, method, params }))
    })
  }

  eval = async <T = unknown>(expr: string): Promise<T> =>
    (
      await this.send<{ result?: { value?: T } }>('Runtime.evaluate', {
        expression: expr,
        returnByValue: true,
        awaitPromise: true,
      })
    ).result?.value as T

  click = async (x: number, y: number, button: 'left' | 'right' = 'left') => {
    for (const type of ['mousePressed', 'mouseReleased'] as const)
      await this.send('Input.dispatchMouseEvent', {
        type,
        x,
        y,
        button,
        clickCount: 1,
      })
  }

  key = async (key: string, code: string, vk: number) => {
    await this.send('Input.dispatchKeyEvent', {
      type: 'rawKeyDown',
      key,
      code,
      windowsVirtualKeyCode: vk,
    })
    await this.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key,
      code,
      windowsVirtualKeyCode: vk,
    })
  }

  // 表达式轮询至 truthy 或超时——probe 等待的统一原语
  waitFor = async <T = unknown>(
    expr: string,
    ms = 20000,
    step = 200,
  ): Promise<T | undefined> => {
    const t0 = Date.now()
    while (Date.now() - t0 < ms) {
      const v = await this.eval<T>(expr)
      if (v) return v
      await sleep(step)
    }
    return undefined
  }

  close = () => this.ws.close()
}

// ── 隔离浏览器实例：profile 用后即焚 + DevToolsActivePort 自分配端口 ──
export type BrowserInstance = { proc: ChildProcess; port: number; dir: string }

export const launchBrowser = async (): Promise<BrowserInstance> => {
  const bin = BROWSERS.find((p) => existsSync(p))
  if (!bin)
    throw new Error('no chromium-family browser found (set BROWSER=)')
  const dir = mkdtempSync(path.join(tmpdir(), 'baba-cdp-'))
  const proc = spawn(
    bin,
    [
      '--headless=new',
      '--remote-debugging-port=0',
      `--user-data-dir=${dir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--window-size=1280,800',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      'about:blank',
    ],
    { stdio: 'ignore' },
  )
  const portFile = path.join(dir, 'DevToolsActivePort')
  for (let i = 0; i < 100; i++) {
    if (existsSync(portFile)) {
      const port = Number((await readFile(portFile, 'utf8')).split('\n')[0])
      if (port > 0) return { proc, port, dir }
    }
    if (proc.exitCode !== null) {
      await rm(dir, { recursive: true, force: true }).catch(() => {})
      throw new Error(`browser exited early (${proc.exitCode})`)
    }
    await sleep(100)
  }
  proc.kill()
  await rm(dir, { recursive: true, force: true }).catch(() => {})
  throw new Error('DevToolsActivePort never appeared')
}

// 页级 target 直连（等 devtools 就绪 + navigate 一页式）
export const openPage = async (port: number, url: string): Promise<Cdp> => {
  let wsUrl = ''
  for (let i = 0; i < 50 && !wsUrl; i++) {
    try {
      const list = (await (
        await fetch(`http://127.0.0.1:${port}/json/list`)
      ).json()) as { type: string; webSocketDebuggerUrl: string }[]
      wsUrl = list.find((t) => t.type === 'page')?.webSocketDebuggerUrl ?? ''
    } catch {
      /* devtools 未就绪 */
    }
    await sleep(100)
  }
  if (!wsUrl) throw new Error('no page target')
  const cdp = await Cdp.connect(wsUrl)
  await cdp.send('Page.enable')
  await cdp.send('Runtime.enable')
  await cdp.send('Page.navigate', { url })
  return cdp
}

export const cleanup = async (
  inst: BrowserInstance,
  server?: Server,
): Promise<void> => {
  inst.proc.kill()
  server?.close()
  await rm(inst.dir, { recursive: true, force: true }).catch(() => {})
}

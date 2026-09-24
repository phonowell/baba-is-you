// cdp.ts — 浏览器驱动 CLI：一次命令 = 起隔离实例 + 起服务 + 顺序执行 ops。
// 浏览器侧调试/性能测量统一走这里——agent-browser 会被日常 Edge 劫持，
// 本驱动起独立 headless 实例（隔离 profile，随进程清理）。
//
//   pnpm cdp '<query>' <op>...
//
//   op:
//     nav:<query>        重新导航（首导航自动 = 首参 query，可为空串）
//     probe              eval window.__babaProbe() 的简写
//     eval:<js>          Runtime.evaluate → JSON 打印（__babaProbe 可用）
//     evalf:<file>       eval 文件内容（多行探针；returnByValue 序列化）
//     shot:<file.png>    Page.captureScreenshot 落盘（人工目检用——断言走
//                        probe/eval，不做截图比对）
//     wait:<js>[,ms]     轮询表达式至 truthy（默认 20s）——打印命中值
//     click:x,y          左键点按；rclick:x,y 右键
//     throttle:<n>       Emulation.setCPUThrottlingRate（1=恢复）
//     metrics:<w>x<h>[@d] Emulation.setDeviceMetricsOverride——大视口/
//                        高 dsf 拉高 fragment 成本，模拟 GPU 瓶颈验证降档
//     key:<name>         方向键/WASD/Enter/Space/Esc/q/z/u/r/n/PgUp/PgDn
//                        （KEYS 表；游戏内 arrows=移动 z/u=撤销 r=重开
//                        n/Enter=下一关 q=返回；菜单 Enter=进关）
//     sleep:<ms>
//
// 例：pnpm cdp '' probe 'key:enter' \
//      'wait:__babaProbe().mode==="game"' \
//      'evalf:/tmp/baba-perf.js' 'sleep:3000' 'eval:window.__perf'

import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { cleanup, launchBrowser, openPage, serveDir, sleep } from './lib/browser.js'

const ROOT = path.resolve(import.meta.dirname, '..')
const DIST = path.join(ROOT, 'release-local')
const HTML = path.join(DIST, 'baba-is-you.html')

// name → [key, code, windowsVirtualKeyCode]。输入层只读 event.key，
// code/vk 走真实值即可。
const KEYS: Record<string, [string, string, number]> = {
  up: ['ArrowUp', 'ArrowUp', 38],
  down: ['ArrowDown', 'ArrowDown', 40],
  left: ['ArrowLeft', 'ArrowLeft', 37],
  right: ['ArrowRight', 'ArrowRight', 39],
  enter: ['Enter', 'Enter', 13],
  esc: ['Escape', 'Escape', 27],
  escape: ['Escape', 'Escape', 27],
  space: [' ', 'Space', 32],
  tab: ['Tab', 'Tab', 9],
  backspace: ['Backspace', 'Backspace', 8],
  pageup: ['PageUp', 'PageUp', 33],
  pagedown: ['PageDown', 'PageDown', 34],
  w: ['w', 'KeyW', 87],
  a: ['a', 'KeyA', 65],
  s: ['s', 'KeyS', 83],
  d: ['d', 'KeyD', 68],
  q: ['q', 'KeyQ', 81],
  z: ['z', 'KeyZ', 90],
  u: ['u', 'KeyU', 85],
  r: ['r', 'KeyR', 82],
  n: ['n', 'KeyN', 78],
}

const main = async () => {
  const [query, ...ops] = process.argv.slice(2)
  if (query === undefined || !ops.length) {
    console.error('usage: pnpm cdp "<query>" <op>...（见文件头）')
    process.exit(2)
  }
  if (!existsSync(HTML)) {
    console.error('✗ release-local/baba-is-you.html 缺失——先 pnpm build')
    process.exit(2)
  }
  const server = await serveDir(DIST)
  const http = (server.address() as { port: number }).port
  const inst = await launchBrowser()
  let rc = 0
  try {
    const cdp = await openPage(
      inst.port,
      `http://127.0.0.1:${http}/baba-is-you.html${query}`,
    )
    const ok = await cdp.waitFor('typeof window.__babaProbe === "function"', 20000)
    if (!ok) {
      console.error('✗ __babaProbe 未挂载')
      rc = 1
    }
    for (const op of ops) {
      if (rc) break
      const ix = op.indexOf(':')
      const [cmd, arg] = ix < 0 ? [op, ''] : [op.slice(0, ix), op.slice(ix + 1)]
      const t0 = Date.now()
      if (cmd === 'nav') {
        await cdp.send('Page.navigate', {
          url: `http://127.0.0.1:${http}/baba-is-you.html${arg}`,
        })
      } else if (cmd === 'eval' || cmd === 'probe' || cmd === 'evalf') {
        const expr =
          cmd === 'probe'
            ? 'window.__babaProbe()'
            : cmd === 'evalf'
              ? await readFile(arg, 'utf8')
              : arg
        const v = await cdp.eval(expr)
        console.log(JSON.stringify(v, null, 1))
      } else if (cmd === 'shot') {
        const r = await cdp.send<{ data: string }>('Page.captureScreenshot', {
          format: 'png',
        })
        await writeFile(arg, Buffer.from(r.data, 'base64'))
        console.log(`✓ shot → ${arg}`)
      } else if (cmd === 'wait') {
        const comma = arg.lastIndexOf(',')
        const [expr, ms] =
          comma >= 0 && /^\d+$/.test(arg.slice(comma + 1))
            ? [arg.slice(0, comma), Number(arg.slice(comma + 1))]
            : [arg, 20000]
        const v = await cdp.waitFor(expr, ms)
        if (v === undefined) {
          console.error(`✗ wait 超时: ${expr}`)
          rc = 1
        } else {
          console.log(
            `✓ wait ${((Date.now() - t0) / 1000).toFixed(1)}s → ${JSON.stringify(v)}`,
          )
        }
      } else if (cmd === 'throttle') {
        await cdp.send('Emulation.setCPUThrottlingRate', {
          rate: Number(arg),
        })
      } else if (cmd === 'metrics') {
        const [size, dsf] = arg.split('@')
        const [w, h] = size!.split('x').map(Number)
        await cdp.send('Emulation.setDeviceMetricsOverride', {
          width: w,
          height: h,
          deviceScaleFactor: dsf ? Number(dsf) : 1,
          mobile: false,
        })
      } else if (cmd === 'click' || cmd === 'rclick') {
        const [x, y] = arg.split(',').map(Number)
        await cdp.click(x!, y!, cmd === 'rclick' ? 'right' : 'left')
      } else if (cmd === 'key') {
        const k = KEYS[arg.toLowerCase()]
        if (!k) {
          console.error(`✗ 未知键 ${arg}（KEYS: ${Object.keys(KEYS).join('/')}）`)
          rc = 1
        } else {
          await cdp.key(k[0], k[1], k[2])
        }
      } else if (cmd === 'sleep') {
        await sleep(Number(arg))
      } else {
        console.error(`✗ 未知 op ${op}`)
        rc = 1
      }
    }
    cdp.close()
  } catch (e) {
    console.error('✗', e instanceof Error ? e.message : e)
    rc = 1
  } finally {
    await cleanup(inst, server)
  }
  process.exit(rc)
}

main()

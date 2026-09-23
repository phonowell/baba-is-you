import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { gzipAsync as zopfliGzip } from '@gfx/zopfli'
import { analyzeMetafile, build, transform } from 'esbuild'

import { levels } from '../src/levels.js'
import { parseLevel } from '../src/logic/parse-level.js'
import { frameSize } from '../src/web/pixel-sprites/derive.js'
import { forEachPixel } from '../src/web/pixel-sprites/blit.js'
import { PIXEL_SPRITES } from '../src/web/pixel-sprites/index.js'
import { bindGoldensToLevels } from '../src/web/app-golden-binding.js'
import { GOLDENS_PAYLOAD, resolveGolden } from '../src/web/app-goldens.js'
import {
  applyPackKeystream,
  createKeystream,
  fnv1a,
  PACK_DYNAMIC_IMPORT_RE,
  PACK_STATIC_IMPORT_RE,
  resolvePackDep,
  rewritePackModule,
  scanPackModuleDeps,
} from '../src/web/pack-format.js'
import { encodePng, hexToRgba } from './shared/png.js'

import type { GoldenIndex, GoldenManifestEntry } from '../src/web/app-goldens.js'
import type { LevelData } from '../src/logic/types.js'
import type { Plugin } from 'esbuild'

const currentFilePath = fileURLToPath(import.meta.url)
const currentDirPath = path.dirname(currentFilePath)
const rootDirPath = path.resolve(currentDirPath, '..')
const entryPath = path.join(rootDirPath, 'src/web/app.ts')
const stylePath = path.join(rootDirPath, 'src/web/style.css')
const localOutputPath = path.join(rootDirPath, 'release-local/baba-is-you.html')
const deployDirPath = path.join(rootDirPath, 'release')
const deployHtmlPath = path.join(deployDirPath, 'baba-is-you.html')
const deployBundlePath = path.join(deployDirPath, 'baba-is-you.js')
const deployPayloadsDir = path.join(deployDirPath, 'payloads')

// 部署版域名锁的单一事实源：既注入 bundle（__BABA_ALLOWED_HOSTS__），
// 也用于壳内联 loader 的预检；须与 src/tools/deploy-worker.ts 的
// BASE_PATH / PAYLOADS_PREFIX 保持一致。
const DEPLOY_BASE_PATH = '/baba'
const DEPLOY_ALLOWED_HOSTS = ['auvya.com']
const DEPLOY_LOCK_MESSAGE = `This build only runs on ${DEPLOY_ALLOWED_HOSTS.join(', ')}.`

const escapeInlineScript = (value: string) =>
  value.replaceAll('</script', '<\\/script')
const isLikelyLevelText = (value: string) =>
  !value.includes('${') &&
  /\bTitle\b/i.test(value) &&
  /\bSize\s+\d+x\d+\s*;/i.test(value) &&
  (value.match(/;/g)?.length ?? 0) >= 3
const minifyLevelText = (value: string) => {
  const compactParts = value
    .replace(/\r\n?/g, '\n')
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
  if (compactParts.length === 0) return value
  return `${compactParts.join(';')};`
}
const minifyInlineLevelTemplates = (value: string) =>
  value.replace(/`([\s\S]*?)`/g, (rawLiteral, body) => {
    if (!isLikelyLevelText(body)) return rawLiteral
    return `\`${minifyLevelText(body)}\``
  })
const minifyGlsl = (value: string) =>
  value
    .replace(/\r\n?/g, '\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/g, '').trim())
    .filter((line) => line.length > 0)
    .join('\n')
const isLikelyShader = (value: string) =>
  /\bvoid\s+main\s*\(/.test(value) &&
  /(?:\bgl_FragColor\b|\bgl_Position\b|\btexture2D\b|\btexture\b|\buniform\b)/.test(
    value,
  )
const minifyInlineShaderTemplates = (value: string) =>
  value.replace(
    /((?:vertexShader|fragmentShader)\s*:\s*`)([\s\S]*?)(`)/g,
    (_, prefix, body, suffix) => {
      if (!isLikelyShader(body)) return `${prefix}${body}${suffix}`
      return `${prefix}${minifyGlsl(body)}${suffix}`
    },
  )
const minifyCss = async (value: string) => {
  const result = await transform(value, {
    loader: 'css',
    minify: true,
    legalComments: 'none',
  })
  return result.code.trim()
}
const minifyHtml = (value: string) => {
  const rawBlocks: string[] = []
  const withPlaceholders = value.replace(
    /<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,
    (block) => {
      const placeholder = `__HTML_RAW_BLOCK_${rawBlocks.length}__`
      rawBlocks.push(block)
      return placeholder
    },
  )
  const compactHtml = withPlaceholders
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/>\s+</g, '><')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s*(\/?)>/g, '$1>')
    .replace(/\s*=\s*/g, '=')
    .trim()
  return compactHtml.replace(
    /__HTML_RAW_BLOCK_(\d+)__/g,
    (_, index) => rawBlocks[Number(index)] ?? '',
  )
}
const minifyJs = async (value: string) => {
  const result = await transform(value, {
    loader: 'js',
    minify: true,
    legalComments: 'none',
  })
  return result.code.trim()
}

// 打包载荷 = gzip → XOR 密钥流 → base64（嵌入）或裸字节（deploy 文件）。
// XOR 让产物里不再出现标准 gzip 字节流，提取代码必须先复现 loader 里的
// 密钥派生。这不是加密——派生逻辑随产物下发，只是抬高离线提取/异站复用
// 的成本。种子语义与旧版一致：本地固定种子（file://、localhost 均可解），
// 部署构建按主机名存掩码，非白名单主机连解码都过不了。
const PACK_SALT = 'baba-pack-v1'
const PACK_SEED_LOCAL = 0x9e3779b9
const PACK_SEED_DEPLOY = 0x51ed270b

// ── Golden replay manifest ─────────────────────────────────────────────
// goldens/**/*.json 只进「懒数据 payload」：eager 侧只留下构建期算好的
// levelIndex → name 索引（菜单 hasSolution 排序 + Replay 按钮可见性）。
// 绑定在这里跑而不是运行时跑——启动期不再 parseLevel 几百条记录。
const GOLDENS_DIR = path.join(rootDirPath, 'goldens')
const walkFiles = async (dir: string): Promise<string[]> => {
  const out: string[] = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...(await walkFiles(p)))
    else out.push(p)
  }
  return out
}

const buildGoldensManifest = async (): Promise<GoldenManifestEntry[]> => {
  const files = (await walkFiles(GOLDENS_DIR))
    .filter((p) => p.endsWith('.json'))
    .sort()
  const entries: GoldenManifestEntry[] = []
  for (const file of files) {
    const golden = JSON.parse(await readFile(file, 'utf8'))
    const name = path
      .relative(GOLDENS_DIR, file)
      .replace(/\\/g, '/')
      .replace(/\.json$/, '')
    const entry: GoldenManifestEntry = {
      name,
      inputs: golden.inputs,
      levelSource: golden.level,
    }
    if (golden.levelIndex !== undefined) entry.levelIndex = golden.levelIndex
    if (golden.levelData) {
      entry.levelData = golden.levelData
    } else {
      const levelPath = path.join(GOLDENS_DIR, '..', golden.level)
      entry.levelText = await readFile(levelPath, 'utf8')
    }
    entries.push(entry)
  }
  return entries
}

// 索引 + 精简 manifest：只保留绑定上 campaign 关卡的 golden——未绑定的
// 记录本来就不可达（Replay 按钮只对 index 命中的关卡渲染），不下发。
// 规范化 JSON：对象键排序后序列化，用于逐字段比对两份 LevelData 是否
// 等价（与键序无关；数组序仍参与比对——items 顺序是回放语义的一部分）。
const canonicalJson = (value: unknown): string =>
  JSON.stringify(value, (_key, val) =>
    val && typeof val === 'object' && !Array.isArray(val)
      ? Object.fromEntries(
          Object.keys(val as Record<string, unknown>)
            .sort()
            .map((key) => [key, (val as Record<string, unknown>)[key]]),
        )
      : val,
  )

const buildGoldenIndex = (
  manifest: GoldenManifestEntry[],
  levelData: LevelData[],
): { index: GoldenIndex; bound: GoldenManifestEntry[] } => {
  const goldens = manifest
    .map((entry) => resolveGolden(entry))
    .filter((golden) => golden.level.width > 0 && golden.level.height > 0)
  const binding = bindGoldensToLevels(goldens, levelData)
  const index: GoldenIndex = {}
  const boundIndicesByName = new Map<string, number[]>()
  levelData.forEach((_, levelIndex) => {
    const golden = binding.forLevelIndex(levelIndex)
    if (!golden) return
    index[String(levelIndex)] = golden.name
    const list = boundIndicesByName.get(golden.name) ?? []
    list.push(levelIndex)
    boundIndicesByName.set(golden.name, list)
  })
  // bound golden 的回放板面就是 campaign 关卡本身：内嵌快照与绑定关卡
  // 的 parseLevel 规范化相等时，levelData/levelText 可从下发 manifest
  // 剥离（运行时经 levelIndex 取回同一份数据），只保留 name/inputs/
  // levelIndex。不相等的条目保留原样——录制的板面仍是权威数据源。
  const bound = manifest
    .filter((entry) => boundIndicesByName.has(entry.name))
    .map((entry) => {
      const embedded =
        entry.levelData ??
        (entry.levelText ? parseLevel(entry.levelText) : undefined)
      if (!embedded) return entry
      const candidates = [
        ...(entry.levelIndex !== undefined ? [entry.levelIndex] : []),
        ...(boundIndicesByName.get(entry.name) ?? []),
      ]
      const embeddedJson = canonicalJson(embedded)
      const match = candidates.find(
        (i) => canonicalJson(levelData[i]) === embeddedJson,
      )
      if (match === undefined) return entry
      return {
        name: entry.name,
        inputs: entry.inputs,
        levelSource: entry.levelSource,
        levelIndex: match,
      }
    })
  return { index, bound }
}

const goldenIndexPlugin = (index: GoldenIndex): Plugin => ({
  name: 'baba-golden-index',
  setup: (b) => {
    b.onResolve({ filter: /^baba-golden-index$/ }, () => ({
      path: 'baba-golden-index',
      namespace: 'baba-golden-index',
    }))
    b.onLoad({ filter: /.*/, namespace: 'baba-golden-index' }, () => ({
      contents: `export default ${JSON.stringify(index)}`,
      loader: 'js',
    }))
  },
})

const deployMode = process.argv.includes('--deploy')
const pack = !process.argv.includes('--raw')
const fastPack = process.argv.includes('--fast')
const analyze = process.argv.includes('--analyze')

const manifest = await buildGoldensManifest()
const levelData = levels.map((level) => parseLevel(level))
const { index: goldenIndex, bound: boundManifest } = buildGoldenIndex(
  manifest,
  levelData,
)

// ── Bundle: esm + splitting ────────────────────────────────────────────
// import() 边界（src/web/board-3d-lazy.ts）切成独立 chunk；共享代码自动
// 落进公共 chunk。产物不落盘——每个输出文件独立打包成一个 payload。
const outdirPath = path.join(rootDirPath, 'packed-out')
const bundleResult = await build({
  entryPoints: [entryPath],
  bundle: true,
  format: 'esm',
  splitting: true,
  outdir: 'packed-out',
  chunkNames: 'chunks/[name]-[hash]',
  platform: 'browser',
  target: 'es2022',
  charset: 'utf8',
  drop: ['console', 'debugger'],
  write: false,
  minify: true,
  legalComments: 'none',
  metafile: true,
  define: {
    __BABA_ALLOWED_HOSTS__: deployMode
      ? JSON.stringify(DEPLOY_ALLOWED_HOSTS)
      : 'null',
  },
  plugins: [goldenIndexPlugin(goldenIndex)],
})

if (analyze) {
  console.log(await analyzeMetafile(bundleResult.metafile!))
}

const moduleTexts = new Map<string, string>()
for (const output of bundleResult.outputFiles ?? []) {
  const name = path.relative(outdirPath, output.path).split(path.sep).join('/')
  moduleTexts.set(
    name,
    minifyInlineShaderTemplates(minifyInlineLevelTemplates(output.text)),
  )
}
const entryName = `${path.basename(entryPath).replace(/\.ts$/, '')}.js`
if (!moduleTexts.has(entryName)) {
  throw new Error(`Bundle output is missing entry ${entryName}.`)
}

// 静态依赖图：构建期断言无环（loader 的 blob URL 重写按 DAG 递归），并
// 分出 eager（入口静态可达，启动即需）与 lazy（仅 import() 可达）两层。
const assertAcyclic = (): void => {
  const visiting = new Set<string>()
  const done = new Set<string>()
  const visit = (name: string): void => {
    if (done.has(name)) return
    if (visiting.has(name)) {
      throw new Error(`Circular static chunk dependency at ${name}.`)
    }
    visiting.add(name)
    for (const spec of scanPackModuleDeps(moduleTexts.get(name) ?? '')
      .staticDeps) {
      visit(resolvePackDep(name, spec))
    }
    visiting.delete(name)
    done.add(name)
  }
  for (const name of moduleTexts.keys()) visit(name)
}
const collectEagerModules = (): Set<string> => {
  const eager = new Set<string>()
  const visit = (name: string): void => {
    if (eager.has(name)) return
    eager.add(name)
    for (const spec of scanPackModuleDeps(moduleTexts.get(name) ?? '')
      .staticDeps) {
      visit(resolvePackDep(name, spec))
    }
  }
  visit(entryName)
  return eager
}
assertAcyclic()
const eagerModules = collectEagerModules()

// ── Payloads ───────────────────────────────────────────────────────────
// JS 模块 + goldens 数据 payload 走同一条 pack 管线；数据 payload 不进
// 模块图（__babaPack.text 解码即用）。
const packPayload = (text: string): Promise<Uint8Array> => {
  if (!pack) return Promise.resolve(new TextEncoder().encode(text))
  if (fastPack) return Promise.resolve(gzipSync(text, { level: 6 }))
  return zopfliGzip(text, { numiterations: 5 })
}

const payloadTexts = new Map<string, string>(moduleTexts)
payloadTexts.set(GOLDENS_PAYLOAD, JSON.stringify(boundManifest))
const packedPayloads = new Map<string, Uint8Array>()
await Promise.all(
  [...payloadTexts.entries()].map(async ([name, text]) => {
    packedPayloads.set(name, await packPayload(text))
  }),
)

// ── Loader ─────────────────────────────────────────────────────────────
// 内联引导：解码 payload（embedded base64 或 deploy 拉取）→ XOR → gunzip；
// 模块 payload 说明符重写为依赖的 blob URL 后经 import() 装载——动态
// import() 边界保持懒，静态链递归备齐。函数体/正则全部经 toString 注入
// （与 src/web/pack-format.ts 单一事实源共用实现）。
const renderLoader = (): Promise<string> => {
  const seed = deployMode ? PACK_SEED_DEPLOY : PACK_SEED_LOCAL
  const embedded: Record<string, string> = {}
  for (const [name, bytes] of packedPayloads) {
    // 部署版只内嵌 eager 层；懒 payload 走 /baba/payloads/ 按需拉取。
    if (deployMode && !eagerModules.has(name)) continue
    embedded[name] = Buffer.from(
      applyPackKeystream(bytes, seed),
    ).toString('base64')
  }
  const seedSource = deployMode
    ? `(() => {
        const mask = (${JSON.stringify(
          Object.fromEntries(
            DEPLOY_ALLOWED_HOSTS.map((host) => [
              host,
              (PACK_SEED_DEPLOY ^ fnv1a(`${PACK_SALT}|${host}`)) >>> 0,
            ]),
          ),
        )})[location.hostname]
        return mask === undefined
          ? null
          : (mask ^ (${fnv1a.toString()})(${JSON.stringify(`${PACK_SALT}|`)} + location.hostname)) >>> 0
      })()`
    : `${PACK_SEED_LOCAL}`

  return minifyJs(`
(() => {
  const fail = (message) => {
    const host = document.getElementById('app')
    if (host) host.textContent = message
  }
  const seed = ${seedSource}
  if (seed === null) {
    fail(${JSON.stringify(DEPLOY_LOCK_MESSAGE)})
    return
  }
  const GZIP = ${pack ? 'true' : 'false'}
  if (GZIP && typeof DecompressionStream !== 'function') {
    fail('This build requires DecompressionStream (Chrome 80+, Firefox 113+, Safari 16.4+).')
    return
  }
  const createKeystream = ${createKeystream.toString()}
  const applyPackKeystream = ${applyPackKeystream.toString()}
  const resolvePackDep = ${resolvePackDep.toString()}
  const scanPackModuleDeps = ${scanPackModuleDeps.toString()}
  const rewritePackModule = ${rewritePackModule.toString()}
  const PACK_DYNAMIC_IMPORT_RE = ${PACK_DYNAMIC_IMPORT_RE}
  const PACK_STATIC_IMPORT_RE = ${PACK_STATIC_IMPORT_RE}
  const PACK_BASE = ${JSON.stringify(`${DEPLOY_BASE_PATH}/payloads/`)}
  const embedded = ${JSON.stringify(embedded)}

  // decode/prepare 的失败 Promise 不落缓存——瞬时拉取失败后可重试，
  // 否则一次网络抖动会永久拖死懒加载（与 board-3d-mount 同策）。
  const decoded = {}
  const decode = (name) => decoded[name] ??= (async () => {
    let bin
    const inline = embedded[name]
    if (inline !== undefined) {
      bin = Uint8Array.from(atob(inline), (char) => char.charCodeAt(0))
    } else {
      const response = await fetch(PACK_BASE + name)
      if (!response.ok) throw new Error('payload ' + name + ' -> ' + response.status)
      bin = new Uint8Array(await response.arrayBuffer())
    }
    const unmasked = applyPackKeystream(bin, seed)
    if (!GZIP) return unmasked
    return new Uint8Array(await new Response(
      new Blob([unmasked]).stream().pipeThrough(new DecompressionStream('gzip')),
    ).arrayBuffer())
  })().catch((error) => {
    delete decoded[name]
    throw error
  })

  const preparing = new Set()
  const moduleUrls = {}
  const prepareModule = (name) => {
    if (moduleUrls[name]) return moduleUrls[name]
    if (preparing.has(name)) {
      return Promise.reject(new Error('circular pack chunk: ' + name))
    }
    preparing.add(name)
    const prepared = (async () => {
      try {
        const code = new TextDecoder().decode(await decode(name))
        const deps = scanPackModuleDeps(code).staticDeps
        const urls = {}
        await Promise.all(deps.map(async (spec) => {
          const dep = resolvePackDep(name, spec)
          urls[dep] = await prepareModule(dep)
        }))
        const rewritten = rewritePackModule(code, name, (dep) => {
          const url = urls[dep]
          if (url === undefined) throw new Error('unresolved pack dep: ' + dep)
          return url
        })
        return URL.createObjectURL(new Blob([rewritten], { type: 'text/javascript' }))
      } finally {
        preparing.delete(name)
      }
    })()
    moduleUrls[name] = prepared
    prepared.catch(() => {
      if (moduleUrls[name] === prepared) delete moduleUrls[name]
    })
    return prepared
  }

  globalThis.__babaPack = {
    import: (name) => prepareModule(name).then((url) => import(url)),
    text: async (name) => new TextDecoder().decode(await decode(name)),
  }

  __babaPack.import(${JSON.stringify(entryName)}).catch((error) => {
    const message = error instanceof Error ? error.message : String(error)
    fail('Failed to unpack bundle: ' + message)
  })
})()
`)
}

const css = await minifyCss(await readFile(stylePath, 'utf8'))
const loaderCode = await renderLoader()

// ── Favicon ─────────────────────────────────────────────────────────
// 打包期自动从 PIXEL_SPRITES 注册表光栅化 baba 基帧：forEachPixel 与运行时
// 绘制同一迭代路径、encodePng 与 sprite 工具同一编码器——sprite 数据或
// 像素管线改动都会自动同步进 favicon，不存在分叉的静态资源。
const FAVICON_SCALE = 4

const renderFaviconPng = () => {
  const sprite = PIXEL_SPRITES.baba
  const frame = sprite?.frames[0]
  if (sprite === undefined || frame === undefined) {
    throw new Error('PIXEL_SPRITES.baba is missing its base frame')
  }
  const { width, height } = frameSize(frame)
  const size = Math.max(width, height) * FAVICON_SCALE
  const pixels = Buffer.alloc(size * size * 4)
  const offsetX = Math.floor((size - width * FAVICON_SCALE) / 2)
  const offsetY = Math.floor((size - height * FAVICON_SCALE) / 2)
  forEachPixel(frame, sprite.palette, (x, y, color) => {
    const [r, g, b, a] = hexToRgba(color)
    const baseX = offsetX + x * FAVICON_SCALE
    const baseY = offsetY + y * FAVICON_SCALE
    for (let dy = 0; dy < FAVICON_SCALE; dy += 1) {
      for (let dx = 0; dx < FAVICON_SCALE; dx += 1) {
        const i = ((baseY + dy) * size + baseX + dx) * 4
        pixels[i] = r
        pixels[i + 1] = g
        pixels[i + 2] = b
        pixels[i + 3] = a
      }
    }
  })
  return encodePng(size, size, pixels)
}

const faviconHref = `data:image/png;base64,${renderFaviconPng().toString('base64')}`

const renderHtmlDocument = (inlineScript: string) =>
  minifyHtml(
    [
      '<!doctype html>',
      '<html lang="en">',
      '<head>',
      '<meta charset="utf-8">',
      // viewport-fit=cover lets the app reach the notch edges so the
      // safe-area-inset paddings in style.css can do their job.
      '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
      '<meta name="theme-color" content="#242e3e">',
      `<link rel="icon" type="image/png" href="${faviconHref}">`,
      '<title>Baba Is You</title>',
      `<style>${css}</style>`,
      '</head>',
      '<body>',
      '<div id="app"></div>',
      `<script>${inlineScript}</script>`,
      '</body>',
      '</html>',
    ].join(''),
  )

// 壳只含样式与加载器：域名不符直接显示锁提示；域名相符才拉取
// bundle（绝对路径，file:// 或其他域打开时自然失败）。Worker 侧另有
// Sec-Fetch-Site 门控，这里只是尽早给出提示。
const renderDeployLoader = () =>
  minifyJs(`
const showLock = () => {
  const host = document.getElementById('app')
  if (host) host.textContent = ${JSON.stringify(DEPLOY_LOCK_MESSAGE)}
}
if (!${JSON.stringify(DEPLOY_ALLOWED_HOSTS)}.includes(location.hostname)) {
  showLock()
} else {
  const bundle = document.createElement('script')
  bundle.src = ${JSON.stringify(`${DEPLOY_BASE_PATH}/baba-is-you.js`)}
  bundle.onerror = showLock
  document.head.appendChild(bundle)
}
`)

const kib = (bytes: number) => `${(bytes / 1024).toFixed(0)} KiB`
const reportPayloads = () => {
  const rows = [...payloadTexts.keys()]
    .map((name) => {
      const raw = payloadTexts.get(name)?.length ?? 0
      const packed = packedPayloads.get(name)?.length ?? 0
      return { name, raw, packed, lazy: !eagerModules.has(name) }
    })
    .sort((a, b) => b.packed - a.packed)
  for (const row of rows.slice(0, 12)) {
    console.log(
      `  ${row.lazy ? 'lazy ' : 'eager'} ${row.name} — ${kib(row.raw)} → ${kib(row.packed)}`,
    )
  }
  if (rows.length > 12) console.log(`  … ${rows.length - 12} more payloads`)
}

if (deployMode) {
  const html = renderHtmlDocument(escapeInlineScript(await renderDeployLoader()))
  await mkdir(deployDirPath, { recursive: true })
  await rm(deployPayloadsDir, { recursive: true, force: true })
  await writeFile(deployHtmlPath, html, 'utf8')
  await writeFile(deployBundlePath, loaderCode, 'utf8')
  for (const [name, bytes] of packedPayloads) {
    if (eagerModules.has(name)) continue
    const filePath = path.join(deployPayloadsDir, name)
    await mkdir(path.dirname(filePath), { recursive: true })
    await writeFile(filePath, applyPackKeystream(bytes, PACK_SEED_DEPLOY))
  }
  const rel = (p: string) => path.relative(rootDirPath, p)
  console.log(
    `Built ${rel(deployHtmlPath)} (${kib(html.length)} shell) + ` +
      `${rel(deployBundlePath)} (${kib(loaderCode.length)} loader+eager, ` +
      `hosts: ${DEPLOY_ALLOWED_HOSTS.join(', ')})`,
  )
  reportPayloads()
} else {
  const html = renderHtmlDocument(escapeInlineScript(loaderCode))
  await mkdir(path.dirname(localOutputPath), { recursive: true })
  await writeFile(localOutputPath, html, 'utf8')
  console.log(
    `Built ${path.relative(rootDirPath, localOutputPath)} (${kib(html.length)})`,
  )
  reportPayloads()
}

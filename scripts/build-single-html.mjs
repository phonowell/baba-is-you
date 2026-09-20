import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { gzipAsync as zopfliGzip } from '@gfx/zopfli'
import { build, transform } from 'esbuild'

const currentFilePath = fileURLToPath(import.meta.url)
const currentDirPath = path.dirname(currentFilePath)
const rootDirPath = path.resolve(currentDirPath, '..')
const entryPath = path.join(rootDirPath, 'src/web/app.ts')
const stylePath = path.join(rootDirPath, 'src/web/style.css')
const localOutputPath = path.join(rootDirPath, 'release-local/baba-is-you.html')
const deployDirPath = path.join(rootDirPath, 'release')
const deployHtmlPath = path.join(deployDirPath, 'baba-is-you.html')
const deployBundlePath = path.join(deployDirPath, 'baba-is-you.js')

// 部署版域名锁的单一事实源：既注入 bundle（__BABA_ALLOWED_HOSTS__），
// 也用于壳内联 loader 的预检；须与 src/tools/deploy-worker.ts 的 BASE_PATH 保持一致。
const DEPLOY_BASE_PATH = '/baba'
const DEPLOY_ALLOWED_HOSTS = ['auvya.com']
const DEPLOY_LOCK_MESSAGE = `This build only runs on ${DEPLOY_ALLOWED_HOSTS.join(', ')}.`

const escapeInlineScript = (value) => value.replaceAll('</script', '<\\/script')
const isLikelyLevelText = (value) =>
  !value.includes('${') &&
  /\bTitle\b/i.test(value) &&
  /\bSize\s+\d+x\d+\s*;/i.test(value) &&
  (value.match(/;/g)?.length ?? 0) >= 3
const minifyLevelText = (value) => {
  const compactParts = value
    .replace(/\r\n?/g, '\n')
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
  if (compactParts.length === 0) return value
  return `${compactParts.join(';')};`
}
const minifyInlineLevelTemplates = (value) =>
  value.replace(/`([\s\S]*?)`/g, (rawLiteral, body) => {
    if (!isLikelyLevelText(body)) return rawLiteral
    return `\`${minifyLevelText(body)}\``
  })
const minifyGlsl = (value) =>
  value
    .replace(/\r\n?/g, '\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/g, '').trim())
    .filter((line) => line.length > 0)
    .join('\n')
const isLikelyShader = (value) =>
  /\bvoid\s+main\s*\(/.test(value) &&
  /(?:\bgl_FragColor\b|\bgl_Position\b|\btexture2D\b|\btexture\b|\buniform\b)/.test(value)
const minifyInlineShaderTemplates = (value) =>
  value.replace(
    /((?:vertexShader|fragmentShader)\s*:\s*`)([\s\S]*?)(`)/g,
    (_, prefix, body, suffix) => {
      if (!isLikelyShader(body)) return `${prefix}${body}${suffix}`
      return `${prefix}${minifyGlsl(body)}${suffix}`
    },
  )
const minifyCss = async (value) => {
  const result = await transform(value, {
    loader: 'css',
    minify: true,
    legalComments: 'none',
  })
  return result.code.trim()
}
const minifyHtml = (value) => {
  const rawBlocks = []
  const withPlaceholders = value.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, (block) => {
    const placeholder = `__HTML_RAW_BLOCK_${rawBlocks.length}__`
    rawBlocks.push(block)
    return placeholder
  })
  const compactHtml = withPlaceholders
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/>\s+</g, '><')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s*(\/?)>/g, '$1>')
    .replace(/\s*=\s*/g, '=')
    .trim()
  return compactHtml.replace(/__HTML_RAW_BLOCK_(\d+)__/g, (_, index) => rawBlocks[Number(index)] ?? '')
}
const minifyJs = async (value) => {
  const result = await transform(value, {
    loader: 'js',
    minify: true,
    legalComments: 'none',
  })
  return result.code.trim()
}
// 打包载荷 = zopfli-gzip → XOR 密钥流 → base64。XOR 让产物里不再出现
// 标准 gzip 字节流，提取代码必须先复现 loader 里的密钥派生，而不是
// 直接 base64 -d | gunzip。本地构建用固定种子（file://、localhost 均可解）；
// 部署构建按主机名存种子掩码：仅白名单主机可还原出同一种子，其他来源
// 连掩码项都没有 → 直接落到锁定提示（与域名锁同语义，但失败发生在解码前）。
// 这不是加密——派生逻辑随产物下发，只是抬高离线提取/异站复用的成本。
const PACK_SALT = 'baba-pack-v1'
const PACK_SEED_LOCAL = 0x9e3779b9
const PACK_SEED_DEPLOY = 0x51ed270b

// fnv1a / createKeystream 会经 toString 注入打包 loader，构建侧与运行时
// 共用同一份实现；因此函数体只能引用全局对象与字面量，不得依赖模块作用域。
const fnv1a = (text) => {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash >>> 0
}
const createKeystream = (seed) => {
  let state = seed >>> 0
  let word = 0
  let left = 0
  return () => {
    if (left === 0) {
      state = (state + 0x6d2b79f5) >>> 0
      let t = state
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      word = (t ^ (t >>> 14)) >>> 0
      left = 4
    }
    left -= 1
    const byte = word & 0xff
    word >>>= 8
    return byte
  }
}

const renderPackedBootstrap = async (script, deploy) => {
  const seed = deploy ? PACK_SEED_DEPLOY : PACK_SEED_LOCAL
  const compressed = await zopfliGzip(script, { numiterations: 5 })
  const nextKey = createKeystream(seed)
  const payload = Buffer.from(
    Uint8Array.from(compressed, (byte) => byte ^ nextKey()),
  ).toString('base64')
  // 部署构建为每个白名单主机烘焙「种子 ^ fnv(salt|host)」掩码；
  // 运行时查表还原种子，查不到即未授权主机。
  const seedSource = deploy
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
  } else if (typeof DecompressionStream !== 'function') {
    fail('This build requires DecompressionStream (Chrome 80+, Firefox 113+, Safari 16.4+).')
  } else {
    const nextKey = (${createKeystream.toString()})(seed)
    const run = async () => {
      const bin = Uint8Array.from(atob(${JSON.stringify(payload)}), (char) =>
        char.charCodeAt(0) ^ nextKey(),
      )
      const code = await new Response(
        new Blob([bin]).stream().pipeThrough(new DecompressionStream('gzip')),
      ).text()
      const element = document.createElement('script')
      element.textContent = code
      document.head.appendChild(element)
    }
    run().catch((error) => {
      const message = error instanceof Error ? error.message : String(error)
      fail('Failed to unpack bundle: ' + message)
    })
  }
})()
`)
}

const deployMode = process.argv.includes('--deploy')
const pack = !process.argv.includes('--raw')

// ── Golden replay manifest ─────────────────────────────────────────────
// The in-level "Solution" button plays the golden recorded on the current
// board (`goldens/**/*.json`, bound to campaign levels in
// src/web/app-golden-binding.ts). The manifest keeps just what playback
// needs — name, input string, and the level: embedded `levelData` when
// the recording pinned its own layout, otherwise the referenced
// `levels/**/*.txt` source (parsed by parseLevel at runtime).
const GOLDENS_DIR = path.join(rootDirPath, 'goldens')
const walkFiles = async (dir) => {
  const out = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...(await walkFiles(p)))
    else out.push(p)
  }
  return out
}
const buildGoldensManifest = async () => {
  const files = (await walkFiles(GOLDENS_DIR))
    .filter((p) => p.endsWith('.json'))
    .sort()
  const entries = []
  for (const file of files) {
    const golden = JSON.parse(await readFile(file, 'utf8'))
    const name = path
      .relative(GOLDENS_DIR, file)
      .replace(/\\/g, '/')
      .replace(/\.json$/, '')
    const entry = { name, inputs: golden.inputs, levelSource: golden.level }
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
const goldensManifestPlugin = {
  name: 'baba-goldens-manifest',
  setup: (b) => {
    b.onResolve({ filter: /^baba-goldens$/ }, () => ({
      path: 'baba-goldens',
      namespace: 'baba-goldens',
    }))
    b.onLoad({ filter: /.*/, namespace: 'baba-goldens' }, async () => {
      const entries = await buildGoldensManifest()
      return {
        contents: `export default ${JSON.stringify(entries)}`,
        loader: 'js',
      }
    })
  },
}

const bundleResult = await build({
  entryPoints: [entryPath],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  charset: 'utf8',
  drop: ['console', 'debugger'],
  write: false,
  minify: true,
  legalComments: 'none',
  define: {
    __BABA_ALLOWED_HOSTS__: deployMode ? JSON.stringify(DEPLOY_ALLOWED_HOSTS) : 'null',
  },
  plugins: [goldensManifestPlugin],
})

const scriptFile = bundleResult.outputFiles[0]
if (!scriptFile) throw new Error('Failed to emit JavaScript bundle.')

const css = await minifyCss(await readFile(stylePath, 'utf8'))
const script = minifyInlineShaderTemplates(minifyInlineLevelTemplates(scriptFile.text))
const bundleCode = pack ? await renderPackedBootstrap(script, deployMode) : script

const renderHtmlDocument = (inlineScript) =>
  minifyHtml([
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    // viewport-fit=cover lets the app reach the notch edges so the
    // safe-area-inset paddings in style.css can do their job.
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
    '<meta name="theme-color" content="#242e3e">',
    '<title>Baba Is You</title>',
    `<style>${css}</style>`,
    '</head>',
    '<body>',
    '<div id="app"></div>',
    `<script>${inlineScript}</script>`,
    '</body>',
    '</html>',
  ].join(''))

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

if (deployMode) {
  const html = renderHtmlDocument(escapeInlineScript(await renderDeployLoader()))
  await mkdir(deployDirPath, { recursive: true })
  await writeFile(deployHtmlPath, html, 'utf8')
  await writeFile(deployBundlePath, bundleCode, 'utf8')
  const rel = (p) => path.relative(rootDirPath, p)
  console.log(
    `Built ${rel(deployHtmlPath)} (${(html.length / 1024).toFixed(0)} KiB shell) + ` +
      `${rel(deployBundlePath)} (${(bundleCode.length / 1024).toFixed(0)} KiB bundle, ` +
      `hosts: ${DEPLOY_ALLOWED_HOSTS.join(', ')})`,
  )
} else {
  const html = renderHtmlDocument(escapeInlineScript(bundleCode))
  await mkdir(path.dirname(localOutputPath), { recursive: true })
  await writeFile(localOutputPath, html, 'utf8')
  const detail = pack ? `, gzip-packed from ${(script.length / 1024).toFixed(0)} KiB` : ''
  console.log(
    `Built ${path.relative(rootDirPath, localOutputPath)} ` +
      `(${(html.length / 1024).toFixed(0)} KiB${detail})`,
  )
}

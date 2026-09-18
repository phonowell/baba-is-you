import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

import { build, transform } from 'esbuild'

const currentFilePath = fileURLToPath(import.meta.url)
const currentDirPath = path.dirname(currentFilePath)
const rootDirPath = path.resolve(currentDirPath, '..')
const entryPath = path.join(rootDirPath, 'src/web/app.ts')
const stylePath = path.join(rootDirPath, 'src/web/style.css')
const outputPath = path.join(rootDirPath, 'release/baba-is-you.html')

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
const renderPackedBootstrap = (script) => {
  const payload = gzipSync(script, { level: 9 }).toString('base64')
  return minifyJs(`
const fail = (message) => {
  const host = document.getElementById('app')
  if (host) host.textContent = message
}
if (typeof DecompressionStream !== 'function') {
  fail('This build requires DecompressionStream (Chrome 80+, Firefox 113+, Safari 16.4+).')
} else {
  const run = async () => {
    const bin = Uint8Array.from(atob(${JSON.stringify(payload)}), (char) => char.charCodeAt(0))
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
`)
}

const bundleResult = await build({
  entryPoints: [entryPath],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2020',
  write: false,
  minify: true,
  legalComments: 'none',
})

const scriptFile = bundleResult.outputFiles[0]
if (!scriptFile) throw new Error('Failed to emit JavaScript bundle.')

const css = await minifyCss(await readFile(stylePath, 'utf8'))
const script = escapeInlineScript(
  minifyInlineShaderTemplates(minifyInlineLevelTemplates(scriptFile.text)),
)

const pack = !process.argv.includes('--raw')
const inlineScript = pack ? await renderPackedBootstrap(script) : script

const html = minifyHtml([
  '<!doctype html>',
  '<html lang="en">',
  '<head>',
  '<meta charset="utf-8">',
  '<meta name="viewport" content="width=device-width, initial-scale=1">',
  '<title>Baba Is You - Single File</title>',
  `<style>${css}</style>`,
  '</head>',
  '<body>',
  '<div id="app"></div>',
  `<script>${inlineScript}</script>`,
  '</body>',
  '</html>',
].join(''))

await mkdir(path.dirname(outputPath), { recursive: true })
await writeFile(outputPath, html, 'utf8')

const relativeOutputPath = path.relative(rootDirPath, outputPath)
const detail = pack ? `, gzip-packed from ${(script.length / 1024).toFixed(0)} KiB` : ''
console.log(`Built ${relativeOutputPath} (${(html.length / 1024).toFixed(0)} KiB${detail})`)

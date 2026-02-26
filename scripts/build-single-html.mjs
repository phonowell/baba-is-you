import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { build } from 'esbuild'

const currentFilePath = fileURLToPath(import.meta.url)
const currentDirPath = path.dirname(currentFilePath)
const rootDirPath = path.resolve(currentDirPath, '..')
const entryPath = path.join(rootDirPath, 'src/web/app.ts')
const stylePath = path.join(rootDirPath, 'src/web/style.css')
const outputPath = path.join(rootDirPath, 'release/baba-is-you.html')

const escapeInlineScript = (value) => value.replaceAll('</script', '<\\/script')

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

const css = await readFile(stylePath, 'utf8')
const script = escapeInlineScript(scriptFile.text)

const html = [
  '<!doctype html>',
  '<html lang="en">',
  '<head>',
  '<meta charset="utf-8" />',
  '<meta name="viewport" content="width=device-width, initial-scale=1" />',
  '<title>Baba Is You - Single File</title>',
  `<style>${css}</style>`,
  '</head>',
  '<body>',
  '<div id="app"></div>',
  `<script>${script}</script>`,
  '</body>',
  '</html>',
].join('')

await mkdir(path.dirname(outputPath), { recursive: true })
await writeFile(outputPath, html, 'utf8')

const relativeOutputPath = path.relative(rootDirPath, outputPath)
console.log(`Built ${relativeOutputPath}`)

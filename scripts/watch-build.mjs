import { watch } from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const debounceMs = 5000
const currentFilePath = fileURLToPath(import.meta.url)
const scriptsDirPath = path.dirname(currentFilePath)
const rootDirPath = path.resolve(scriptsDirPath, '..')
const watchTargets = [
  path.join(rootDirPath, 'src'),
  path.join(rootDirPath, 'scripts', 'build-single-html.mjs'),
]

let timer = null
let building = false
let buildRequested = false
let lastChangeAt = 0

const runBuild = () => {
  if (building) {
    buildRequested = true
    return
  }
  building = true
  const child = spawn('pnpm', ['build'], {
    cwd: rootDirPath,
    stdio: 'inherit',
  })
  child.on('close', (code) => {
    building = false
    const status = code === 0 ? 'ok' : `failed(${code ?? 'null'})`
    console.log(`[watch] build ${status}`)
    if (!buildRequested) return
    buildRequested = false
    const remainingDelay = Math.max(0, debounceMs - (Date.now() - lastChangeAt))
    timer = setTimeout(runBuild, remainingDelay)
  })
}

const scheduleBuild = () => {
  lastChangeAt = Date.now()
  if (timer) clearTimeout(timer)
  timer = setTimeout(runBuild, debounceMs)
}

for (const target of watchTargets) {
  watch(target, { recursive: true }, (_, filename) => {
    const label = filename ? String(filename) : target
    console.log(`[watch] changed: ${label}`)
    scheduleBuild()
  })
}

console.log(`[watch] listening (debounce ${debounceMs}ms)`)
runBuild()

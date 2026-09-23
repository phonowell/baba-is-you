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
  path.join(rootDirPath, 'scripts', 'build-single-html.ts'),
  // The bundle embeds golden replays + their level sources.
  path.join(rootDirPath, 'goldens'),
  path.join(rootDirPath, 'levels'),
]

let timer = null
let building = false
let buildRequested = false
let lastChangeAt = 0

const isWindows = process.platform === 'win32'

const finishBuild = (status) => {
  building = false
  console.log(`[watch] build ${status}`)
  if (!buildRequested) return
  buildRequested = false
  const remainingDelay = Math.max(0, debounceMs - (Date.now() - lastChangeAt))
  timer = setTimeout(runBuild, remainingDelay)
}

const runBuild = () => {
  if (building) {
    buildRequested = true
    return
  }
  building = true
  // --fast swaps zopfli for plain gzip: a few % larger payload, but the
  // rebuild loop lands in ~2s instead of ~20s.
  const child = isWindows
    ? spawn('cmd.exe', ['/d', '/s', '/c', 'pnpm run build:fast'], {
        cwd: rootDirPath,
        stdio: 'inherit',
      })
    : spawn('pnpm', ['run', 'build:fast'], {
        cwd: rootDirPath,
        stdio: 'inherit',
      })
  let settled = false
  const settle = (status) => {
    if (settled) return
    settled = true
    finishBuild(status)
  }
  child.on('error', (error) => {
    const reason = error.code ?? error.message
    settle(`failed(start:${reason})`)
  })
  child.on('close', (code) => {
    const status = code === 0 ? 'ok' : `failed(${code ?? 'null'})`
    settle(status)
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

// Shared CLI plumbing for the repo's tsx entry tools and scripts:
// `--flag value` lookup, a numeric variant, recursive file listing and
// the direct-run guard that keeps imports side-effect free.
import { readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

export const argValue = (flag: string): string | undefined => {
  const index = process.argv.indexOf(`--${flag}`)
  return index >= 0 ? process.argv[index + 1] : undefined
}

export const numArg = (flag: string, fallback: number): number => {
  const raw = argValue(flag)
  if (raw === undefined) return fallback
  const value = Number(raw)
  if (!Number.isFinite(value)) throw new Error(`--${flag} expects a number`)
  return value
}

export const walkFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    // Dirent flags don't follow symlinks; the tools this replaced used
    // statSync, so a symlinked subdir keeps being walked. A dangling
    // link stats as nothing — it lands in the file list like any entry.
    let isDir = entry.isDirectory()
    if (!isDir && entry.isSymbolicLink()) {
      try {
        isDir = statSync(full).isDirectory()
      } catch {
        isDir = false
      }
    }
    return isDir ? walkFiles(full) : [full]
  })

// Runs `main` only when the module was invoked directly (not imported by
// a test or another tool), exiting non-zero on failure.
export const runCliMain = (
  metaUrl: string,
  main: () => Promise<void>,
): void => {
  const argvEntry = process.argv[1]
  if (!argvEntry) return
  if (pathToFileURL(path.resolve(argvEntry)).href !== metaUrl) return
  main().catch((error: unknown) => {
    console.error(error)
    process.exit(1)
  })
}

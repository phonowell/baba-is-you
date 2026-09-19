// Virtual module emitted by scripts/build-single-html.mjs (esbuild plugin):
// every golden's name + inputs + level source ships inside the bundle.
declare module 'baba-goldens' {
  import type { LevelData } from '../logic/types.js'

  type GoldenManifestEntry = {
    // Golden file name relative to goldens/, sans .json ('1/10-0').
    name: string
    inputs: string
    // The recording's level path ('levels/1-the-lake/10-two-doors.txt').
    levelSource: string
    // Present when the recording pinned its own layout; otherwise the
    // referenced levels/**/*.txt source ships in `levelText`. Absent
    // keys are omitted from the manifest JSON entirely.
    levelData?: LevelData
    levelText?: string
  }

  const entries: GoldenManifestEntry[]
  export default entries
}

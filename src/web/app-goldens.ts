import { parseLevel } from '../logic/parse-level.js'
import { itemSignature } from './app-golden-binding.js'

import type { LevelData } from '../logic/types.js'

// Golden replays ship as a lazily-decoded data payload ('goldens.json',
// see scripts/build-single-html.ts) instead of bundle code: the manifest
// is only fetched when a replay is actually requested. What stays eager
// is the build-time binding index (levelIndex → golden name) that powers
// the menu's hasSolution ordering and the Replay button's visibility.

export type GoldenReplay = {
  // Golden file name relative to goldens/, sans .json ('1/10-0').
  name: string
  // Level title — the recorded layout's own, or the level file's Title
  // statement.
  title: string
  inputs: string
  level: LevelData
  // Solver-emitted goldens pin the campaign index they were generated
  // on; fixture recordings leave it undefined and bind by inference.
  levelIndex?: number
}

// Manifest entry shape emitted into the goldens payload — identical to
// the fields the old baba-goldens virtual module carried.
export type GoldenManifestEntry = {
  name: string
  inputs: string
  levelSource: string
  levelData?: LevelData
  levelText?: string
  levelIndex?: number
}

// Build-time binding output: campaign level index → golden name. Emitted
// by the build script's baba-golden-index virtual module; boards absent
// from the index simply never show a Replay button.
export type GoldenIndex = Record<string, string>

export const GOLDENS_PAYLOAD = 'goldens.json'

export const resolveGolden = (
  entry: GoldenManifestEntry,
  campaignLevels?: readonly LevelData[],
): GoldenReplay => {
  const level =
    entry.levelData ??
    (entry.levelText
      ? parseLevel(entry.levelText)
      : undefined) ??
    (entry.levelIndex !== undefined
      ? campaignLevels?.[entry.levelIndex]
      : undefined) ??
    { title: '', width: 0, height: 0, items: [] }
  return {
    name: entry.name,
    title: level.title,
    inputs: entry.inputs,
    level,
    ...(entry.levelIndex !== undefined ? { levelIndex: entry.levelIndex } : {}),
  }
}

export type GoldenStore = {
  // Campaign board entered from a map icon — the index is resolved once
  // at build time, so this lookup is synchronous and free.
  nameForLevelIndex: (index: number) => string | undefined
  // The board a replay is running on IS the golden's own LevelData object
  // (start-replay stores it as customLevel) — identity is the common match;
  // a layout signature catches a re-parsed copy of the same board. Only
  // already-loaded goldens participate, so this stays cheap and sync.
  loadedForLevel: (level: LevelData) => GoldenReplay | undefined
  // Decodes the payload once, then resolves (parseLevel included) only the
  // requested golden — a replay click never parses the other recordings.
  loadByName: (name: string) => Promise<GoldenReplay | undefined>
}

export const createGoldenStore = (
  readPayload: (name: string) => Promise<string>,
  index: GoldenIndex,
  // Campaign levels resolve stripped entries — the build drops a bound
  // golden's embedded snapshot when it matches the shipped board's parse,
  // so replay falls back to campaignLevels[entry.levelIndex].
  campaignLevels: readonly LevelData[] = [],
): GoldenStore => {
  let manifestPromise: Promise<GoldenManifestEntry[]> | null = null
  const loadedByName = new Map<string, GoldenReplay>()

  const manifest = (): Promise<GoldenManifestEntry[]> =>
    (manifestPromise ??= readPayload(GOLDENS_PAYLOAD)
      .then((text) => JSON.parse(text) as GoldenManifestEntry[])
      .catch((error: unknown) => {
        // A failed payload read must not poison the cache — the next
        // replay request retries the fetch from scratch.
        manifestPromise = null
        throw error
      }))

  const loadByName = async (
    name: string,
  ): Promise<GoldenReplay | undefined> => {
    const cached = loadedByName.get(name)
    if (cached) return cached
    const entry = (await manifest()).find((candidate) => candidate.name === name)
    if (!entry) return undefined
    const golden = resolveGolden(entry, campaignLevels)
    if (golden.level.width <= 0 || golden.level.height <= 0) return undefined
    loadedByName.set(name, golden)
    return golden
  }

  return {
    nameForLevelIndex: (levelIndex) => index[String(levelIndex)],
    loadedForLevel: (level) => {
      const signature = itemSignature(level)
      let signatureHit: GoldenReplay | undefined
      for (const golden of loadedByName.values()) {
        if (golden.level === level) return golden
        if (!signatureHit && itemSignature(golden.level) === signature) {
          signatureHit = golden
        }
      }
      return signatureHit
    },
    loadByName,
  }
}

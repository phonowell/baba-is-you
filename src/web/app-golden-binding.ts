import type { LevelData } from '../logic/types.js'

// The slice of a golden the binding needs — the manifest's GoldenReplay
// satisfies it; tests substitute plain fixtures.
type GoldenWithLevel = {
  level: LevelData
  // Solver-emitted records pin the campaign level they were generated
  // on; an explicit index beats title/signature inference.
  levelIndex?: number
}

// Level identity for golden binding. Campaign titles keep punctuation the
// recorded fixtures dropped ('BRIDGE BUILDING?' recorded as 'BRIDGE
// BUILDING Q'), so titles normalize to alphanumerics; the item signature
// is the layout's (text-flagged name, cell) set — facing and duplicated
// entities collapse, which is what lets it bind a renamed or re-exported
// version of the same board.
const normalizeTitle = (title: string): string =>
  title.toLowerCase().replace(/[^a-z0-9]+/g, '')

const titleKey = (level: LevelData): string =>
  `${normalizeTitle(level.title)}|${level.width}x${level.height}`

const itemSignature = (level: LevelData): string =>
  [
    ...new Set(
      level.items.map(
        (item) => `${item.isText ? '!' : ''}${item.name}@${item.x},${item.y}`,
      ),
    ),
  ]
    .sort()
    .join(';')

export type GoldenLevelBinding<G> = {
  // Campaign board entered from a map icon — the index is the level's
  // identity, resolved once at bind time.
  forLevelIndex: (index: number) => G | undefined
  // A level object outside the campaign list (a replay's own recorded
  // layout) — matched by identity, then by layout signature.
  forLevel: (level: LevelData) => G | undefined
}

export const bindGoldensToLevels = <G extends GoldenWithLevel>(
  goldens: readonly G[],
  levels: readonly LevelData[],
): GoldenLevelBinding<G> => {
  const indicesBy = (
    keyOf: (level: LevelData) => string,
  ): Map<string, number[]> => {
    const map = new Map<string, number[]>()
    levels.forEach((level, index) => {
      const key = keyOf(level)
      map.set(key, [...(map.get(key) ?? []), index])
    })
    return map
  }
  const byTitle = indicesBy(titleKey)
  const bySignature = indicesBy(itemSignature)

  const forIndex = new Map<number, G>()
  const forSignature = new Map<string, G>()

  for (const golden of goldens) {
    const titleHits = byTitle.get(titleKey(golden.level)) ?? []
    const signatureHits = bySignature.get(itemSignature(golden.level)) ?? []
    // A unique title wins outright; a layout signature breaks title ties
    // (BRIDGE BUILDING vs BRIDGE BUILDING?) and rescues recordings whose
    // title changed entirely. Anything still ambiguous stays unbound
    // rather than pinning the wrong board.
    const index =
      titleHits.length === 1
        ? titleHits[0]
        : signatureHits.length === 1
          ? signatureHits[0]
          : undefined
    if (index !== undefined && !forIndex.has(index)) {
      forIndex.set(index, golden)
    }
    const signature = itemSignature(golden.level)
    if (!forSignature.has(signature)) forSignature.set(signature, golden)
  }

  // Solver-emitted goldens carry their campaign index — an explicit pin
  // wins the slot over any heuristic binding that landed there first.
  for (const golden of goldens) {
    if (golden.levelIndex !== undefined && golden.levelIndex < levels.length)
      forIndex.set(golden.levelIndex, golden)
  }

  return {
    forLevelIndex: (index) => forIndex.get(index),
    forLevel: (level) =>
      goldens.find((golden) => golden.level === level) ??
      forSignature.get(itemSignature(level)),
  }
}

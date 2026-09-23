import type { Direction, LevelData, Rule } from './types.js'

export const keyFor = (x: number, y: number, width: number): number =>
  y * width + x

export const inBounds = (
  x: number,
  y: number,
  width: number,
  height: number,
): boolean => x >= 0 && y >= 0 && x < width && y < height

export const keyForLayer = (
  x: number,
  y: number,
  width: number,
  floating: boolean,
): number => keyFor(x, y, width) * 2 + (floating ? 1 : 0)

export const MOVE_DELTAS: Record<Direction, readonly [number, number]> = {
  up: [0, -1],
  right: [1, 0],
  down: [0, 1],
  left: [-1, 0],
}

// Orthogonal neighbor scan order — matches DIRECTIONS (up, right, down, left).
export const ORTHOGONAL_DELTAS: ReadonlyArray<readonly [number, number]> = [
  MOVE_DELTAS.up,
  MOVE_DELTAS.right,
  MOVE_DELTAS.down,
  MOVE_DELTAS.left,
]

// Row-major 3x3 neighborhood (self included at index 4) — `near`
// conditions scan this set.
export const NEIGHBOR_DELTAS: ReadonlyArray<readonly [number, number]> = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [0, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
]

// Bounds-checked neighbor walk shared by the condition matchers: visits
// each in-bounds (x+dx, y+dy) once; dx/dy stay available for callers
// that still need the direction (facing checks).
export const forEachDelta = (
  bounds: { width: number; height: number },
  x: number,
  y: number,
  deltas: ReadonlyArray<readonly [number, number]>,
  visit: (nx: number, ny: number, dx: number, dy: number) => void,
): void => {
  for (const [dx, dy] of deltas) {
    const nx = x + dx
    const ny = y + dy
    if (nx < 0 || ny < 0 || nx >= bounds.width || ny >= bounds.height)
      continue
    visit(nx, ny, dx, dy)
  }
}

// Level identity for golden binding/verification: the item signature is the
// layout's (text-flagged name, cell) set — facing and duplicated entities
// collapse, so a renamed or re-exported version of the same board still
// matches. `layoutSignature` adds board dimensions.
export const levelItemSignature = (level: LevelData): string =>
  [
    ...new Set(
      level.items.map(
        (item) => `${item.isText ? '!' : ''}${item.name}@${item.x},${item.y}`,
      ),
    ),
  ]
    .sort()
    .join(';')

export const layoutSignature = (level: LevelData): string =>
  `${level.width}x${level.height}|${levelItemSignature(level)}`

// Title identity for level lookup — strips everything but lowercase
// alphanumerics so "Level Lake-3" and "levellake3" compare equal.
export const normalizeLevelTitle = (title: string): string =>
  title.toLowerCase().replace(/[^a-z0-9]+/g, '')

// Allocation-free FNV-1a feeding: the deterministic condition rolls
// (`often`/`seldom`/`chill`) hash a `${a}:${b}:…` seed string. Feeding
// the same byte sequence directly — ':' separators and decimal digits —
// produces the identical hash without materializing the string.
export const fnvChar = (hash: number, code: number): number =>
  Math.imul(hash ^ code, 16777619)

export const fnvText = (hash: number, text: string): number => {
  for (let i = 0; i < text.length; i += 1) hash = fnvChar(hash, text.charCodeAt(i))
  return hash
}

export const fnvInt = (hash: number, value: number): number => {
  let remaining = value
  if (remaining < 0) {
    hash = fnvChar(hash, 45) // '-'
    remaining = -remaining
  }
  if (remaining === 0) return fnvChar(hash, 48)
  let divisor = 1
  while (remaining >= divisor * 10) divisor *= 10
  while (divisor > 0) {
    hash = fnvChar(hash, 48 + (Math.floor(remaining / divisor) % 10))
    divisor = Math.floor(divisor / 10)
  }
  return hash
}

export const resolveRuleTargets = <T>(
  item: T,
  rules: readonly Rule[],
  matchesRule: (item: T, rule: Rule) => boolean,
): string[] => {
  if (!rules.length) return []
  const yes = new Set<string>()
  const no = new Set<string>()

  for (const rule of rules) {
    if (!matchesRule(item, rule)) continue
    if (rule.objectNegated) no.add(rule.object)
    else yes.add(rule.object)
  }

  return Array.from(yes).filter((target) => !no.has(target))
}

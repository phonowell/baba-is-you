import { buildGrid, hasProp, resolveLevelProps } from './shared.js'

import type { RuleMatchContext } from '../rule-match.js'
import type { Item, Rule } from '../types.js'

// Bit-exact port of the predecessor's `oorandom::Rand32` (oorandom 11.1.3,
// PCG-XSH-RR with u64 state) so teleported replays match recorded goldens.
const PCG_MULTIPLIER = 6364136223846793005n
const PCG_INC = (1442695040888963407n << 1n) | 1n // new_inc: wrapping_shl(1)|1
const U64 = (1n << 64n) - 1n
const U32 = (1n << 32n) - 1n

const createRng = (seed: number): ((start: number, end: number) => number) => {
  let state = 0n

  const randU32 = (): number => {
    const oldstate = state
    state = (oldstate * PCG_MULTIPLIER + PCG_INC) & U64
    const xorshifted = Number(((oldstate >> 18n) ^ oldstate) >> 27n & U32)
    const rot = Number(oldstate >> 59n)
    return ((xorshifted >>> rot) | (xorshifted << (32 - rot))) >>> 0
  }

  // new(seed): state=0, inc=PCG_INC; rand_u32(); state += seed; rand_u32()
  randU32()
  state = (state + BigInt(seed >>> 0)) & U64
  randU32()

  // rand_range via Lemire's algorithm 5, as in oorandom.
  return (start: number, end: number): number => {
    const s = BigInt((end - start) >>> 0)
    if (s <= 1n) return start

    let m = BigInt(randU32()) * s
    let leftover = m & U32

    if (leftover < s) {
      const threshold = (-s & U32) % s
      while (leftover < threshold) {
        m = BigInt(randU32()) * s
        leftover = m & U32
      }
    }
    return start + Number(m >> 32n)
  }
}

export const applyTeleport = (
  items: Item[],
  width: number,
  height: number,
  seed: number,
  levelRules: Rule[],
  context: RuleMatchContext,
): {
  items: Item[]
  moved: boolean
} => {
  // `level is tele`: the room teleports every unit to a random interior
  // cell (official `action == "tele"` on the level entity).
  if (resolveLevelProps(levelRules, context, 0, 0).has('tele')) {
    const rng = createRng(seed)
    let moved = false
    const next = items.map((item) => {
      const x = 1 + rng(0, Math.max(1, width - 2))
      const y = 1 + rng(0, Math.max(1, height - 2))
      if (item.x === x && item.y === y) return item
      moved = true
      return { ...item, x, y }
    })
    return { items: next, moved }
  }

  if (!items.some((item) => hasProp(item, 'tele')))
    return { items, moved: false }

  const next = items.map((item) => ({ ...item }))
  const byCell = buildGrid(next, width)
  const cellKeys = Array.from(byCell.keys()).sort((a, b) => a - b)

  const padsByCell = new Map<
    number,
    { x: number; y: number; floatLayers: Set<boolean> }
  >()
  const padList: Array<{ x: number; y: number }> = []
  for (const key of cellKeys) {
    const list = byCell.get(key)
    if (!list?.length) continue

    const teleItems = list.filter((item) => hasProp(item, 'tele'))
    if (!teleItems.length) continue

    const sample = teleItems[0]
    if (!sample) continue

    const floatLayers = new Set<boolean>()
    for (const teleItem of teleItems)
      floatLayers.add(hasProp(teleItem, 'float'))

    padsByCell.set(key, { x: sample.x, y: sample.y, floatLayers })
    padList.push({ x: sample.x, y: sample.y })
  }

  if (padList.length < 2) return { items, moved: false }

  const rng = createRng(seed)
  const destinations = new Map<number, { x: number; y: number }>()

  for (const key of cellKeys) {
    const list = byCell.get(key)
    if (!list?.length) continue

    const pad = padsByCell.get(key)
    if (!pad) continue

    for (const floatLayer of [true, false]) {
      if (!pad.floatLayers.has(floatLayer)) continue

      const hasTeleLayer = list.some(
        (item) =>
          hasProp(item, 'tele') && hasProp(item, 'float') === floatLayer,
      )
      if (!hasTeleLayer) continue

      const candidates = padList.filter(
        (candidate) => candidate.x !== pad.x || candidate.y !== pad.y,
      )
      if (!candidates.length) continue

      for (const item of list) {
        if (hasProp(item, 'tele')) continue
        if (hasProp(item, 'float') !== floatLayer) continue

        const dest = candidates[rng(0, candidates.length)]
        if (!dest) continue
        destinations.set(item.id, dest)
      }
    }
  }

  if (!destinations.size) return { items, moved: false }

  let moved = false
  for (const item of next) {
    const dest = destinations.get(item.id)
    if (!dest) continue

    item.x = dest.x
    item.y = dest.y
    moved = true
  }

  return { items: next, moved }
}

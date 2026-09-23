import { hasLatchedFloat, hasProp, resolveLevelProps } from './shared.js'

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
  // cell (official `action == "tele"` on the level entity). Prefilter so
  // levels without the rule skip the props evaluation entirely.
  const hasTeleLevelRule = levelRules.some(
    (rule) => !rule.objectNegated && rule.object === 'tele',
  )
  if (
    hasTeleLevelRule &&
    resolveLevelProps(levelRules, context, 0, 0).has('tele')
  ) {
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

  // Count pads on the input first — most boards have no tele pads, so the
  // clone pass below is only worth it once two pads actually exist.
  let padCount = 0
  for (const item of items) if (hasProp(item, 'tele')) padCount += 1
  if (padCount < 2) return { items, moved: false }

  const next = items.map((item) => ({ ...item }))
  const pads = next.filter((item) => hasProp(item, 'tele'))

  // Official `getname`: text units all share the rule name "text".
  const ruleName = (item: Item): string => (item.isText ? 'text' : item.name)

  const rng = createRng(seed)
  let moved = false

  // Official effectblock iterates the tele pads themselves; each pad sends
  // the units on its cell to a random *same-name* pad. Pad positions are
  // read live — a pad teleported by an earlier pad processes its new cell.
  // Destination candidates are board-ordered so recorded replays stay
  // stable (the official pick order is creation order, but the RNG stream
  // differs anyway — only determinism matters here).
  const padCellOrder = (item: Item): number => item.y * width + item.x

  // Occupant index kept live across teleports so each pad only scans its
  // own cell instead of the whole board.
  const byCell = new Map<number, Item[]>()
  for (const item of next) {
    const key = item.y * width + item.x
    const bucket = byCell.get(key)
    if (bucket) bucket.push(item)
    else byCell.set(key, [item])
  }
  const relocate = (target: Item, x: number, y: number): void => {
    const from = byCell.get(target.y * width + target.x)
    if (from) {
      const index = from.indexOf(target)
      if (index >= 0) from.splice(index, 1)
    }
    const toKey = y * width + x
    const to = byCell.get(toKey)
    if (to) to.push(target)
    else byCell.set(toKey, [target])
    target.x = x
    target.y = y
  }

  for (const pad of pads) {
    const padName = ruleName(pad)
    const destinations = pads
      .filter((other) => other.id !== pad.id && ruleName(other) === padName)
      .sort((a, b) => padCellOrder(a) - padCellOrder(b))
    if (!destinations.length) continue

    // Occupants are re-read at the pad's live position; the slice keeps
    // iteration stable while targets relocate out of the bucket.
    const occupants = byCell.get(pad.y * width + pad.x)
    if (!occupants) continue
    for (const target of occupants.slice()) {
      if (target.id === pad.id) continue
      // `objectdata[id].tele` marks units already teleported this turn
      // (and units restored by `back`); it resets each turn via
      // `clearPerTurnFlags`, matching the official `smallclear()`.
      if (target.teleported) continue
      // A unit whose rule name matches the pad's is never sent (this also
      // keeps text units on text pads and same-name pads in place).
      if (ruleName(target) === padName) continue
      if (hasProp(target, 'still')) continue
      // Official `floating(v,unitid)` compares the LATCHED
      // `values[FLOAT]` — a float rule formed this turn (e.g. a push
      // completing `x is float`) can't flip pad parity until next turn.
      if (hasLatchedFloat(target) !== hasLatchedFloat(pad)) continue

      const dest = destinations[rng(0, destinations.length)]
      if (!dest) continue
      relocate(target, dest.x, dest.y)
      target.teleported = true
      moved = true
    }
  }

  return { items: next, moved }
}

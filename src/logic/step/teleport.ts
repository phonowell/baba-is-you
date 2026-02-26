import { buildGrid, hasProp } from './shared.js'

import type { Item } from '../types.js'

const OORANDOM_MULTIPLIER = 747796405 >>> 0
const OORANDOM_INCREMENT = 2891336453 >>> 0
const OORANDOM_ROTATE_MULTIPLIER = 277803737 >>> 0

const toU32 = (value: number): number => value >>> 0

const defaultSeed = (randSeed: number): number => {
  const value = Math.imul(
    toU32(randSeed ^ OORANDOM_INCREMENT),
    OORANDOM_MULTIPLIER,
  )
  const shift = toU32((value >>> 28) + 4)
  const word = Math.imul(
    toU32((value >>> shift) ^ value),
    OORANDOM_ROTATE_MULTIPLIER,
  )
  return toU32((word >>> 22) ^ word)
}

const createRng = (seed: number): ((start: number, end: number) => number) => {
  let state = defaultSeed(seed)

  const randU32 = (): number => {
    state = toU32(Math.imul(state, OORANDOM_MULTIPLIER) + OORANDOM_INCREMENT)
    const shift = toU32((state >>> 28) + 4)
    const word = Math.imul(
      toU32((state >>> shift) ^ state),
      OORANDOM_ROTATE_MULTIPLIER,
    )
    return toU32((word >>> 22) ^ word)
  }

  return (start: number, end: number): number => {
    if (start >= end) return start

    const range = toU32(end - start)
    if (range <= 1) return start

    let entropy = randU32()
    let scale = BigInt(entropy) * BigInt(range)
    let bias = Number(scale & 0xffffffffn) >>> 0

    if (bias < range) {
      const threshold = toU32(0 - range) % range
      while (bias < threshold) {
        entropy = randU32()
        scale = BigInt(entropy) * BigInt(range)
        bias = Number(scale & 0xffffffffn) >>> 0
      }
    }

    return start + (Number((scale >> 32n) & 0xffffffffn) >>> 0)
  }
}

export const applyTeleport = (
  items: Item[],
  width: number,
  seed: number,
): {
  items: Item[]
  moved: boolean
} => {
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

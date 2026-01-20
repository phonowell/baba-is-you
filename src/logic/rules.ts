import { PROPERTY_WORDS } from './types.js'

import type { LevelItem, Rule } from './types.js'

const IGNORED_WORDS = new Set<string>(['and', 'not', 'on', 'has', 'make'])

const isNounWord = (word: string): boolean => {
  if (PROPERTY_WORDS.has(word)) return false

  if (word === 'is') return false

  return !IGNORED_WORDS.has(word)
}

const keyFor = (x: number, y: number, width: number): number => y * width + x

const getTextAt = (
  grid: Map<number, LevelItem[]>,
  width: number,
  x: number,
  y: number,
): LevelItem[] => grid.get(keyFor(x, y, width)) ?? []

export const collectRules = (
  items: LevelItem[],
  width: number,
  height: number,
): Rule[] => {
  const grid = new Map<number, LevelItem[]>()
  for (const item of items) {
    if (!item.isText) continue

    if (item.x < 0 || item.x >= width || item.y < 0 || item.y >= height)
      continue

    const key = keyFor(item.x, item.y, width)
    const list = grid.get(key) ?? []
    list.push(item)
    grid.set(key, list)
  }

  const rules: Rule[] = []
  const seen = new Set<string>()

  for (const item of items) {
    if (!item.isText || item.name !== 'is') continue

    const dirs: Array<[number, number]> = [
      [1, 0],
      [0, 1],
    ]

    for (const [dx, dy] of dirs) {
      const lx = item.x - dx
      const ly = item.y - dy
      const rx = item.x + dx
      const ry = item.y + dy

      if (
        lx < 0 ||
        ly < 0 ||
        rx < 0 ||
        ry < 0 ||
        lx >= width ||
        rx >= width ||
        ly >= height ||
        ry >= height
      )
        continue

      const leftItems = getTextAt(grid, width, lx, ly)
      const rightItems = getTextAt(grid, width, rx, ry)
      if (!leftItems.length || !rightItems.length) continue

      for (const left of leftItems) {
        if (!isNounWord(left.name) && left.name !== 'text') continue

        for (const right of rightItems) {
          if (right.name === 'is') continue

          const kind = PROPERTY_WORDS.has(right.name) ? 'property' : 'transform'
          if (
            kind === 'transform' &&
            !isNounWord(right.name) &&
            right.name !== 'text'
          )
            continue

          const rule: Rule = {
            subject: left.name,
            object: right.name,
            kind,
          }
          const key = `${rule.subject}:${rule.kind}:${rule.object}`
          if (seen.has(key)) continue

          seen.add(key)
          rules.push(rule)
        }
      }
    }
  }

  return rules
}

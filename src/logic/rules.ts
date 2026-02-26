import {
  getWordsAt,
  inBounds,
  isPredicateWordForHas,
  isPredicateWordForIs,
  isSubjectWord,
  keyFor,
  parseTermChains,
  uniqueTerms,
} from './rules-parse.js'
import { PROPERTY_WORDS } from './types.js'

import type { LevelItem, Rule } from './types.js'

export const collectRules = (
  items: LevelItem[],
  width: number,
  height: number,
): Rule[] => {
  const grid = new Map<number, string[]>()
  for (const item of items) {
    if (!item.isText) continue
    if (item.x < 0 || item.x >= width || item.y < 0 || item.y >= height)
      continue

    const key = keyFor(item.x, item.y, width)
    const list = grid.get(key) ?? []
    list.push(item.name)
    grid.set(key, list)
  }

  const maxDepth = width + height
  const rules: Rule[] = []
  const seen = new Set<string>()

  for (const item of items) {
    if (!item.isText || (item.name !== 'is' && item.name !== 'has')) continue

    const dirs: Array<[number, number]> = [
      [1, 0],
      [0, 1],
    ]

    for (const [dx, dy] of dirs) {
      const readSubjectWordsAt = (position: number): string[] => {
        const x = item.x - dx * position
        const y = item.y - dy * position
        if (!inBounds(x, y, width, height)) return []
        return getWordsAt(grid, width, x, y)
      }
      const readObjectWordsAt = (position: number): string[] => {
        const x = item.x + dx * position
        const y = item.y + dy * position
        if (!inBounds(x, y, width, height)) return []
        return getWordsAt(grid, width, x, y)
      }

      const subjectChains = parseTermChains(
        readSubjectWordsAt,
        1,
        isSubjectWord,
        0,
        maxDepth,
        true,
        true,
      )
      const subjectTerms = uniqueTerms(subjectChains.chains)
      if (!subjectTerms.length) continue

      const objectChains = parseTermChains(
        readObjectWordsAt,
        1,
        item.name === 'is' ? isPredicateWordForIs : isPredicateWordForHas,
        0,
        maxDepth,
        false,
        false,
      )
      const objectTerms = uniqueTerms(objectChains.chains)
      if (!objectTerms.length) continue

      for (const subject of subjectTerms) {
        for (const object of objectTerms) {
          const rule: Rule = {
            subject: subject.word,
            ...(subject.negated ? { subjectNegated: true } : {}),
            object: object.word,
            ...(object.negated ? { objectNegated: true } : {}),
            kind:
              item.name === 'has'
                ? 'has'
                : PROPERTY_WORDS.has(object.word)
                  ? 'property'
                  : 'transform',
          }
          const key = `${rule.subjectNegated ? '!' : ''}${rule.subject}:${rule.kind}:${
            rule.objectNegated ? '!' : ''
          }${rule.object}`
          if (seen.has(key)) continue
          seen.add(key)
          rules.push(rule)
        }
      }
    }
  }

  return rules
}

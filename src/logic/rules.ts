import {
  getWordsAt,
  inBounds,
  isPredicateWordForHas,
  isPredicateWordForIs,
  keyFor,
  parseTermChains,
  uniqueTerms,
} from './rules-parse.js'
import { collectSubjectPatterns, stringifyCondition } from './rules-subjects.js'
import { PROPERTY_WORDS } from './types.js'

import type { LevelItem, Rule } from './types.js'

const ruleKindFor = (
  operator: string,
  objectWord: string,
): Rule['kind'] => {
  if (operator === 'has') return 'has'
  if (operator === 'make') return 'make'
  if (operator === 'eat') return 'eat'
  if (operator === 'write') return 'write'
  return PROPERTY_WORDS.has(objectWord) ? 'property' : 'transform'
}

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
    if (
      !item.isText ||
      (item.name !== 'is' &&
        item.name !== 'has' &&
        item.name !== 'make' &&
        item.name !== 'eat' &&
        item.name !== 'write')
    )
      continue

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

      const subjectPatterns = collectSubjectPatterns(readSubjectWordsAt, maxDepth)
      if (!subjectPatterns.length) continue

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

      for (const subject of subjectPatterns) {
        for (const object of objectTerms) {
          const rule: Rule = {
            subject: subject.subject,
            ...(subject.subjectNegated ? { subjectNegated: true } : {}),
            object: object.word,
            ...(object.negated ? { objectNegated: true } : {}),
            kind: ruleKindFor(item.name, object.word),
            ...(subject.condition ? { condition: subject.condition } : {}),
          }
          const conditionKey = stringifyCondition(rule.condition)
          const key = `${rule.subjectNegated ? '!' : ''}${rule.subject}:${conditionKey}:${
            rule.kind
          }:${rule.objectNegated ? '!' : ''}${rule.object}`
          if (seen.has(key)) continue
          seen.add(key)
          rules.push(rule)
        }
      }
    }
  }

  return rules
}

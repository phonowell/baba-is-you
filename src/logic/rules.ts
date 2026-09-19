import {
  inBounds,
  isPredicateWordForHas,
  isPredicateWordForIs,
  keyFor,
  parseTermChainsWithNext,
  uniqueTerms,
} from './rules-parse.js'
import {
  collectBridgedSubjectPatterns,
  collectSubjectPatterns,
  stringifyCondition,
} from './rules-subjects.js'
import { asObjectWord, PROPERTY_WORDS, RULE_OPERATOR_WORDS } from './types.js'

import type { LevelItem, Rule, RuleCondition } from './types.js'

const ruleKindFor = (
  operator: string,
  objectWord: string,
): Rule['kind'] => {
  if (operator === 'has') return 'has'
  if (operator === 'make') return 'make'
  if (operator === 'eat') return 'eat'
  if (operator === 'write') return 'write'
  if (operator === 'fear') return 'fear'
  if (operator === 'follow') return 'follow'
  if (operator === 'mimic') return 'mimic'
  if (operator === 'play') return 'play'
  if (operator === 'become') return 'become'
  // `x is revert` is the official transform back to the entity's original
  // kind, not a property — route it into the transform bucket even though
  // `revert` sits in the type-2 word list.
  if (objectWord === 'revert') return 'is-transform'
  return PROPERTY_WORDS.has(objectWord) ? 'is-property' : 'is-transform'
}

const OPERATOR_WORDS = new Set<string>(RULE_OPERATOR_WORDS)
const RULE_SCAN_DIRS: Array<[number, number]> = [
  [1, 0],
  [0, 1],
]

// A produced rule plus the ids of the text items that form its phrase.
// Rendering uses `cells` to strike out overridden rules: a text item is
// marked when it participates in an overridden rule and no active one.
export type RuleInstance = {
  rule: Rule
  cells: number[]
}

const conditionWords = (condition?: RuleCondition): string[] => {
  if (!condition) return []
  if ('direction' in condition) return ['facing', condition.direction]
  if (!('object' in condition)) return [condition.kind]
  return [condition.kind, condition.object]
}

export const collectRuleInstances = (
  items: LevelItem[],
  width: number,
  height: number,
): RuleInstance[] => {
  const grid = new Map<number, string[]>()
  const textAt = new Map<number, LevelItem[]>()
  for (const item of items) {
    // `word` objects act as their noun in rule text (they contribute the
    // word but are not text cards, so they stay out of `textAt`'s
    // strike-through marking).
    const isWord =
      !item.isText &&
      'props' in item &&
      Array.isArray(item.props) &&
      item.props.includes('word')
    if (!item.isText && !isWord) continue
    if (item.x < 0 || item.x >= width || item.y < 0 || item.y >= height)
      continue

    const key = keyFor(item.x, item.y, width)
    const list = grid.get(key) ?? []
    list.push(item.name)
    grid.set(key, list)
    if (item.isText) {
      const cellItems = textAt.get(key) ?? []
      cellItems.push(item)
      textAt.set(key, cellItems)
    }
  }

  const maxDepth = width + height
  const instances: RuleInstance[] = []

  for (const item of items) {
    if (!item.isText || !OPERATOR_WORDS.has(item.name)) continue

    for (const [dx, dy] of RULE_SCAN_DIRS) {
      const subjectCellAt = (position: number): number | undefined => {
        const x = item.x - dx * position
        const y = item.y - dy * position
        if (!inBounds(x, y, width, height)) return undefined
        return keyFor(x, y, width)
      }
      const objectCellAt = (position: number): number | undefined => {
        const x = item.x + dx * position
        const y = item.y + dy * position
        if (!inBounds(x, y, width, height)) return undefined
        return keyFor(x, y, width)
      }
      const readSubjectWordsAt = (position: number): string[] => {
        const key = subjectCellAt(position)
        return key === undefined ? [] : (grid.get(key) ?? [])
      }
      const readObjectWordsAt = (position: number): string[] => {
        const key = objectCellAt(position)
        return key === undefined ? [] : (grid.get(key) ?? [])
      }

      const subjectPatterns = collectSubjectPatterns(readSubjectWordsAt, maxDepth)
      if (item.name === 'is' || item.name === 'has')
        subjectPatterns.push(
          ...collectBridgedSubjectPatterns(readSubjectWordsAt, maxDepth),
        )
      if (!subjectPatterns.length) continue

      const objectChains = parseTermChainsWithNext(
        readObjectWordsAt,
        1,
        item.name === 'is' ? isPredicateWordForIs : isPredicateWordForHas,
        0,
        maxDepth,
        false,
        false,
      )
      const objectTerms = uniqueTerms(objectChains.chains.map((c) => c.terms))
      if (!objectTerms.length) continue

      // Cells of the full object phrase — the union of every produced
      // chain's consumed positions; per-rule filtering happens via the
      // rule's own word set, matching the predecessor's index marking.
      const objectEnd = Math.max(
        ...objectChains.chains.map((chain) => chain.next),
      )
      const objectCells: number[] = []
      for (let position = 1; position < objectEnd; position += 1) {
        const key = objectCellAt(position)
        if (key === undefined) break
        objectCells.push(key)
      }

      for (const subject of subjectPatterns) {
        const phraseCells = new Set<number>([
          keyFor(item.x, item.y, width),
          ...objectCells,
        ])
        for (
          let position = subject.span.start;
          position < subject.span.end;
          position += 1
        ) {
          const key = subjectCellAt(position)
          if (key === undefined) break
          phraseCells.add(key)
        }

        for (const object of objectTerms) {
          const rule: Rule = {
            subject: subject.subject,
            ...(subject.subjectNegated ? { subjectNegated: true } : {}),
            object: asObjectWord(object.word),
            ...(object.negated ? { objectNegated: true } : {}),
            kind: ruleKindFor(item.name, object.word),
            ...(subject.condition ? { condition: subject.condition } : {}),
          }
          // `and` belongs to every conjunct's phrase in the predecessor's
          // index marking; `not` never does.
          const words = new Set<string>([
            rule.subject,
            item.name,
            object.word,
            'and',
            ...conditionWords(rule.condition),
          ])
          const cells: number[] = []
          for (const key of phraseCells) {
            for (const textItem of textAt.get(key) ?? []) {
              if (words.has(textItem.name)) cells.push(textItem.id)
            }
          }
          instances.push({ rule, cells })
        }
      }
    }
  }

  return instances
}

const ruleDedupeKey = (rule: Rule): string =>
  `${rule.subjectNegated ? '!' : ''}${rule.subject}:${stringifyCondition(
    rule.condition,
  )}:${rule.kind}:${rule.objectNegated ? '!' : ''}${rule.object}`

// `x mimic y` copies every active non-mimic rule whose subject is `y` onto
// subject `x` (official `featureindex` copy in rules.lua). `x mimic not y`
// is protection: it blocks copying `y`'s rules onto `x`. Negated-subject
// rules (`not y is push`) are never copied — the official `trule[1] ==
// target` check compares base words. Copied rules keep their own
// condition, or inherit the mimic rule's when they have none.
export const expandMimicRules = (rules: Rule[]): Rule[] => {
  if (!rules.some((rule) => rule.kind === 'mimic')) return rules

  const protectedPairs = new Set<string>()
  for (const rule of rules) {
    if (rule.kind === 'mimic' && rule.objectNegated)
      protectedPairs.add(`${rule.subjectNegated ? '!' : ''}${rule.subject}:${rule.object}`)
  }

  const seen = new Set<string>(rules.map(ruleDedupeKey))
  const expanded = [...rules]
  for (const mimic of rules) {
    if (mimic.kind !== 'mimic' || mimic.objectNegated) continue
    if (
      protectedPairs.has(
        `${mimic.subjectNegated ? '!' : ''}${mimic.subject}:${mimic.object}`,
      )
    )
      continue
    for (const rule of rules) {
      if (rule.kind === 'mimic') continue
      if (
        (rule.subject as string) !== (mimic.object as string) ||
        rule.subjectNegated
      )
        continue
      const copied: Rule = {
        subject: mimic.subject,
        ...(mimic.subjectNegated ? { subjectNegated: true } : {}),
        kind: rule.kind,
        object: rule.object,
        ...(rule.objectNegated ? { objectNegated: true } : {}),
        ...(rule.condition ?? mimic.condition
          ? { condition: rule.condition ?? mimic.condition }
          : {}),
      }
      const key = ruleDedupeKey(copied)
      if (seen.has(key)) continue
      seen.add(key)
      expanded.push(copied)
    }
  }
  return expanded
}

export const collectRules = (
  items: LevelItem[],
  width: number,
  height: number,
): Rule[] => {
  const rules: Rule[] = []
  const seen = new Set<string>()
  for (const { rule } of collectRuleInstances(items, width, height)) {
    const key = ruleDedupeKey(rule)
    if (seen.has(key)) continue
    seen.add(key)
    rules.push(rule)
  }
  return expandMimicRules(rules)
}

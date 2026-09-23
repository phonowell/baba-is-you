import {
  collectLetterCells,
  collectSpelledWords,
  isLetterName,
} from './letter-words.js'
import type { SpelledWord } from './letter-words.js'
import {
  inBounds,
  isPredicateWordForIs,
  isPredicateWordForNoun,
  keyFor,
  parseTermChainsWithNext,
} from './rules-parse.js'
import {
  collectBridgedSubjectPatterns,
  collectSubjectPatterns,
  stringifyCondition,
} from './rules-subjects.js'
import { asObjectWord, PROPERTY_WORDS, RULE_OPERATOR_WORDS } from './types.js'

import type { ScannedTerm } from './rules-parse-terms.js'
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
// `subjectSourceIds` records which units spelled the subject word — the
// official `ids[1]` entry — so the unstable-word-rule guard can tell a
// `text_x` card from a `word`-prop object spelling its own noun.
export type RuleInstance = {
  rule: Rule
  cells: number[]
  subjectSourceIds: readonly number[]
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
  const grid = new Map<number, LevelItem[]>()
  const textAt = new Map<number, LevelItem[]>()
  // Letter item ids per cell — the source ids (`unitids`) of spelled
  // subject words for the unstable-word-rule check.
  const letterIdsAt = new Map<number, number[]>()
  const letterCells = collectLetterCells(items, width, height)
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
    // Letter units never act as standalone words — they only enter rules
    // through spelled runs collected below.
    const isLetter = item.isText && isLetterName(item.name)
    if (!isLetter) {
      const list = grid.get(key) ?? []
      list.push(item)
      grid.set(key, list)
    } else {
      const ids = letterIdsAt.get(key) ?? []
      ids.push(item.id)
      letterIdsAt.set(key, ids)
    }
    if (item.isText) {
      const cellItems = textAt.get(key) ?? []
      cellItems.push(item)
      textAt.set(key, cellItems)
    }
  }

  // Letter runs spell words that behave like multi-cell text units
  // (rules.lua `formlettermap`): each substring matching the official
  // dictionary yields a word anchored between its first and last cell.
  // The dictionary is `unitreference` — the global object table — so
  // level-local names like the ??? world's `ba`/`ab` digraph letters are
  // never spellable words themselves.
  const spelledWords: SpelledWord[] = []
  const spelledByStart = new Map<number, SpelledWord[]>()
  const spelledByEnd = new Map<number, SpelledWord[]>()
  if (letterCells.size) {
    spelledWords.push(
      ...collectSpelledWords(
        letterCells,
        width,
        height,
        undefined,
        items.some((item) => item.isText && item.name === 'play'),
      ),
    )
    for (const spelled of spelledWords) {
      const byStart = spelledByStart.get(spelled.startKey) ?? []
      byStart.push(spelled)
      spelledByStart.set(spelled.startKey, byStart)
      const byEnd = spelledByEnd.get(spelled.endKey) ?? []
      byEnd.push(spelled)
      spelledByEnd.set(spelled.endKey, byEnd)
    }
  }

  // A spelled word's source ids are the letter units along its run —
  // always more than one cell's worth (or a text-named note), so spelled
  // subjects are never unstable-word-rule suspects.
  const spelledSourceIds = new Map<SpelledWord, number[]>()
  for (const spelled of spelledWords) {
    const [sdx, sdy] = RULE_SCAN_DIRS[spelled.dir] ?? [1, 0]
    const sx = spelled.startKey % width
    const sy = (spelled.startKey - sx) / width
    const ids: number[] = []
    for (let i = 0; i < spelled.span; i += 1)
      ids.push(
        ...(letterIdsAt.get(keyFor(sx + sdx * i, sy + sdy * i, width)) ?? []),
      )
    spelledSourceIds.set(spelled, ids)
  }

  const maxDepth = width + height
  const instances: RuleInstance[] = []

  // Operator anchors: ordinary operator text (span 1) plus spelled operator
  // words. A spelled `is` scans subjects left of its first letter and
  // objects right of its last.
  type OperatorAnchor = {
    word: string
    startKey: number
    endKey: number
    cells: number[]
    // Spelled operators only scan along their own direction; ordinary text
    // anchors scan both.
    dir?: number
  }
  const anchors: OperatorAnchor[] = []
  for (const item of items) {
    if (
      !item.isText ||
      isLetterName(item.name) ||
      !OPERATOR_WORDS.has(item.name)
    )
      continue
    if (!inBounds(item.x, item.y, width, height)) continue
    const key = keyFor(item.x, item.y, width)
    anchors.push({ word: item.name, startKey: key, endKey: key, cells: [key] })
  }
  for (const spelled of spelledWords) {
    if (!OPERATOR_WORDS.has(spelled.word)) continue
    const cells: number[] = []
    const [dx, dy] = RULE_SCAN_DIRS[spelled.dir] ?? [1, 0]
    const sx = spelled.startKey % width
    const sy = (spelled.startKey - sx) / width
    for (let i = 0; i < spelled.span; i += 1)
      cells.push(keyFor(sx + dx * i, sy + dy * i, width))
    anchors.push({
      word: spelled.word,
      startKey: spelled.startKey,
      endKey: spelled.endKey,
      cells,
      dir: spelled.dir,
    })
  }

  for (const anchor of anchors) {
    const anchorX = anchor.startKey % width
    const anchorY = (anchor.startKey - anchorX) / width
    const endX = anchor.endKey % width
    const endY = (anchor.endKey - endX) / width

    for (const [dirIndex, [dx, dy]] of RULE_SCAN_DIRS.entries()) {
      if (anchor.dir !== undefined && anchor.dir !== dirIndex) continue

      const subjectCellAt = (position: number): number | undefined => {
        const x = anchorX - dx * position
        const y = anchorY - dy * position
        if (!inBounds(x, y, width, height)) return undefined
        return keyFor(x, y, width)
      }
      const objectCellAt = (position: number): number | undefined => {
        const x = endX + dx * position
        const y = endY + dy * position
        if (!inBounds(x, y, width, height)) return undefined
        return keyFor(x, y, width)
      }
      const readSubjectTermsAt = (position: number): ScannedTerm[] => {
        const key = subjectCellAt(position)
        if (key === undefined) return []
        const terms: ScannedTerm[] = []
        for (const item of grid.get(key) ?? [])
          terms.push({ word: item.name, span: 1, sourceIds: [item.id] })
        for (const spelled of spelledByEnd.get(key) ?? [])
          if (spelled.dir === dirIndex)
            terms.push({
              word: spelled.word,
              span: spelled.span,
              sourceIds: spelledSourceIds.get(spelled) ?? [],
            })
        return terms
      }
      const readObjectTermsAt = (position: number): ScannedTerm[] => {
        const key = objectCellAt(position)
        if (key === undefined) return []
        const terms: ScannedTerm[] = []
        for (const item of grid.get(key) ?? [])
          terms.push({ word: item.name, span: 1, sourceIds: [item.id] })
        for (const spelled of spelledByStart.get(key) ?? [])
          if (spelled.dir === dirIndex)
            terms.push({
              word: spelled.word,
              span: spelled.span,
              sourceIds: spelledSourceIds.get(spelled) ?? [],
            })
        return terms
      }

      const subjectPatterns = collectSubjectPatterns(
        readSubjectTermsAt,
        maxDepth,
      )
      if (anchor.word === 'is' || anchor.word === 'has')
        subjectPatterns.push(
          ...collectBridgedSubjectPatterns(readSubjectTermsAt, maxDepth),
        )
      if (!subjectPatterns.length) continue

      const objectChains = parseTermChainsWithNext(
        readObjectTermsAt,
        1,
        // Officially `is`/`write` take a noun or property object
        // (argtype {0,2}); every other verb takes nouns only ({0}).
        anchor.word === 'is' || anchor.word === 'write'
          ? isPredicateWordForIs
          : isPredicateWordForNoun,
        0,
        maxDepth,
        false,
        false,
      )
      // Officially every `and`-conjunct lands its own `addoption` call —
      // `x is shift and shift` enters `features` twice and the duplicated
      // rule stacks (double belts move riders twice). Keep per-chain,
      // per-term occurrences instead of deduping by word.
      const objectTerms = objectChains.chains.flatMap((chain) => chain.terms)
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
        const phraseCells = new Set<number>([...anchor.cells, ...objectCells])
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
            kind: ruleKindFor(anchor.word, object.word),
            ...(subject.condition ? { condition: subject.condition } : {}),
          }
          // `and` belongs to every conjunct's phrase in the predecessor's
          // index marking; `not` never does. Letter tiles inside a covered
          // phrase cell are the spelled word's own letters.
          const words = new Set<string>([
            rule.subject,
            anchor.word,
            object.word,
            'and',
            ...conditionWords(rule.condition),
          ])
          const cells: number[] = []
          for (const key of phraseCells) {
            for (const textItem of textAt.get(key) ?? []) {
              if (words.has(textItem.name) || isLetterName(textItem.name))
                cells.push(textItem.id)
            }
          }
          instances.push({
            rule,
            cells,
            subjectSourceIds: subject.subjectSourceIds ?? [],
          })
        }
      }
    }
  }

  return pruneUnstableWordInstances(instances, items)
}

const isWordPropRule = (rule: Rule): boolean =>
  rule.kind === 'is-property' &&
  rule.object === 'word' &&
  !rule.objectNegated

// Official `findwordunits` recursion guard (rules.lua): an `x is word`
// rule whose subject word is spelled by a single unit that is not the
// `text_x` card — a `word`-prop object naming itself — is unstable. The
// rescue scan only consults word rules whose subject is the suspect's
// own, `all`, or a `not` phrase; among those, `all`, `group*`, and
// `mimic` copies rescue outright, as do `not`-phrases naming a different
// subject — anything else must cite a real `text_x` tile. An unrescued
// suspect kills every `x is word`/`not x is word` rule and the parse
// re-runs without the word prop it carried (the official `never` conds +
// `code(true)`), collapsing dependent rules the object spelled
// (e.g. `belt is shift` in Canister).
const pruneUnstableWordInstances = (
  instances: RuleInstance[],
  items: readonly LevelItem[],
): RuleInstance[] => {
  const wordInstances: RuleInstance[] = []
  for (const instance of instances)
    if (isWordPropRule(instance.rule)) wordInstances.push(instance)
  if (!wordInstances.length) return instances

  const itemsById = new Map<number, LevelItem>()
  for (const item of items) itemsById.set(item.id, item)

  const rawSubject = (rule: Rule): string =>
    rule.subjectNegated ? `not ${rule.subject}` : rule.subject

  const suspects: RuleInstance[] = []
  // Every `x is word` formation is a potential rescuer — the official scan
  // inspects each featureindex["word"] entry's full id list for a
  // `text_<subject>` tile; `cells` holds exactly those text ids.
  const rescuers: Array<{
    raw: string
    negated: boolean
    citesSubjectText: boolean
    mimic: boolean
  }> = []
  for (const instance of wordInstances) {
    const { rule } = instance
    const negated = rule.subjectNegated ?? false
    rescuers.push({
      raw: rawSubject(rule),
      negated,
      citesSubjectText:
        !negated &&
        instance.cells.some((id) => {
          const item = itemsById.get(id)
          return (
            item !== undefined && item.isText && item.name === rule.subject
          )
        }),
      mimic: false,
    })
    const sources = instance.subjectSourceIds
    if (sources.length !== 1) continue
    const unit = itemsById.get(sources[0]!)
    // `ids[1][1]` named `text_x` (or `text_x` for `not x`) is a real card.
    if (unit !== undefined && unit.isText && unit.name === rule.subject)
      continue
    suspects.push(instance)
  }
  if (!suspects.length) return instances

  // `x mimic y` copies of `y is word` enter featureindex["word"] carrying
  // the "mimic" tag, which rescues any suspect they are scanned for.
  const deduped: Rule[] = []
  const seen = new Set<string>()
  for (const { rule } of instances) {
    const key = ruleDedupeKey(rule)
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(rule)
  }
  const expanded = expandMimicRules(deduped)
  for (const rule of expanded.slice(deduped.length)) {
    if (!isWordPropRule(rule)) continue
    rescuers.push({
      raw: rawSubject(rule),
      negated: rule.subjectNegated ?? false,
      citesSubjectText: false,
      mimic: true,
    })
  }

  const nuked = new Set<string>()
  for (const suspect of suspects) {
    const subject = suspect.rule.subject
    const suspectRaw = rawSubject(suspect.rule)
    // Officially the rescue scan only consults word rules whose subject is
    // the suspect's own, `all`, or a `not …` phrase.
    const stable = rescuers.some(
      (rescuer) =>
        (rescuer.raw === subject ||
          rescuer.raw === 'all' ||
          rescuer.negated) &&
        (rescuer.mimic ||
          rescuer.raw === 'all' ||
          rescuer.raw.startsWith('group') ||
          (rescuer.negated && rescuer.raw !== suspectRaw) ||
          rescuer.citesSubjectText),
    )
    if (!stable) nuked.add(subject)
  }
  if (!nuked.size) return instances
  return instances.filter(
    (instance) =>
      !isWordPropRule(instance.rule) || !nuked.has(instance.rule.subject),
  )
}

export const ruleDedupeKey = (rule: Rule): string =>
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

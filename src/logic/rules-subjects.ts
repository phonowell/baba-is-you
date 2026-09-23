import {
  isConditionParamWord,
  isSubjectWord,
  parseTermChainsWithNext,
} from './rules-parse.js'

import type { ParsedTerm } from './rules-parse.js'

import {
  asConditionObjectWord,
  asSubjectWord,
  isDirectionWord,
  isObjectWord,
  INFIX_CONDITION_WORDS,
  POSTFIX_CONDITION_WORDS,
  PROPERTY_WORDS,
  RULE_OPERATOR_WORDS,
} from './types.js'

import type { ReadTermsAt, ScannedTerm } from './rules-parse-terms.js'
import type { PostfixConditionKind, RuleCondition } from './types.js'

type SubjectPattern = {
  subject: ReturnType<typeof asSubjectWord>
  subjectNegated?: boolean
  condition?: RuleCondition
  // Cell span (read positions, end-exclusive) this subject's phrase
  // occupies — used to attribute rule text cells for override marking.
  span: { start: number; end: number }
  // Unit ids spelling this subject word — the official `ids[1]` the
  // unstable-word-rule guard inspects for non-`text_x` sources.
  subjectSourceIds?: readonly number[]
}

const CONDITION_OPERATOR_WORDS = INFIX_CONDITION_WORDS

// Words that can legally continue a sentence after a subject phrase —
// `and` extends the subject list, operators open the predicate, infix
// conditions attach a parameter. Any other word stacked on the same
// cell belongs to a parse variant that officially fails (its `not` /
// postfix variants promote differently and are not modelled here).
const SENTENCE_CONTINUATION_WORDS = new Set<string>([
  'and',
  'not',
  ...RULE_OPERATOR_WORDS,
  ...INFIX_CONDITION_WORDS,
])

// Type-3 condition words attach to the subject with no parameter — the
// same slot `lonely` occupies: `BABA IDLE IS YOU`.
const POSTFIX_CONDITION_WORD_SET = new Set<string>(POSTFIX_CONDITION_WORDS)

const findTerm = (
  terms: readonly ScannedTerm[],
  word: string,
): ScannedTerm | undefined => terms.find((term) => term.word === word)

// Consecutive `not` terms from `position`, each consuming its own span.
const countConsecutiveNot = (
  readTermsAt: ReadTermsAt,
  position: number,
): { count: number; offset: number } => {
  let count = 0
  let offset = 0
  for (;;) {
    const notTerm = findTerm(readTermsAt(position + offset), 'not')
    if (!notTerm) break
    offset += notTerm.span
    count += 1
  }
  return { count, offset }
}

export const stringifyCondition = (condition?: RuleCondition): string => {
  if (!condition) return ''
  if (!('object' in condition))
    return `if:${condition.negated ? '!' : ''}${condition.kind}`
  if ('direction' in condition)
    return `if:facing:${condition.negated ? '!' : ''}${condition.direction}`
  return `if:${condition.kind}:${condition.negated ? '!' : ''}${
    'objectNegated' in condition && condition.objectNegated ? '!' : ''
  }${condition.object}`
}

export const collectSubjectPatterns = (
  readTermsAt: ReadTermsAt,
  maxDepth: number,
): SubjectPattern[] => {
  const result: SubjectPattern[] = []

  const addPattern = (subject: SubjectPattern): void => {
    // No dedupe: officially each `and`-conjunct lands its own feature
    // entry, so `a and a is p` counts `a is p` twice (same stacking rule
    // as duplicated object terms). Distinct parse chains are distinct
    // official sentences and likewise keep their own copies.
    result.push(subject)
  }

  const addSubjectTerms = (
    subjectTerms: readonly ParsedTerm[],
    span: { start: number; end: number },
    condition?: RuleCondition,
  ): void => {
    for (const subject of subjectTerms) {
      addPattern({
        subject: asSubjectWord(subject.word),
        ...(subject.negated ? { subjectNegated: true } : {}),
        ...(condition ? { condition } : {}),
        span,
        subjectSourceIds: subject.sourceIds,
      })
    }
  }

  // The chain before the operator is either the subject list or — when a
  // condition word follows — its parameter list, which officially may
  // hold properties (`feeling`) or directions (`facing`). Parse broadly
  // (`isObjectWord` = type 0/2) and validate once the role is known.
  const subjectOrConditionChains = parseTermChainsWithNext(
    readTermsAt,
    1,
    isObjectWord,
    0,
    maxDepth,
    true,
    true,
  )

  for (const chain of subjectOrConditionChains.chains) {
    const nextTerms = readTermsAt(chain.next)

    const postfixTerm = nextTerms.find((term) =>
      POSTFIX_CONDITION_WORD_SET.has(term.word),
    )
    if (postfixTerm) {
      // Postfix conditions attach to a subject — every conjunct must be a
      // noun (`stop lonely is you` officially dies at `stop`).
      if (!chain.terms.every((term) => isSubjectWord(term.word))) continue
      const nots = countConsecutiveNot(
        readTermsAt,
        chain.next + postfixTerm.span,
      )
      addSubjectTerms(
        chain.terms,
        { start: 1, end: chain.next + postfixTerm.span + nots.offset },
        {
          kind: postfixTerm.word as PostfixConditionKind,
          ...(nots.count % 2 === 1 ? { negated: true } : {}),
        },
      )
      continue
    }

    const conditionTerm = nextTerms.find((term) =>
      (CONDITION_OPERATOR_WORDS as readonly string[]).includes(term.word),
    )
    if (conditionTerm) {
      const conditionKind =
        conditionTerm.word as (typeof INFIX_CONDITION_WORDS)[number]
      // `x not on y`: `not` directly ahead of the condition word negates
      // the condition itself; `x on not y` negates the condition's
      // object instead (handled via `term.negated` below).
      const nots = countConsecutiveNot(
        readTermsAt,
        chain.next + conditionTerm.span,
      )
      const conditionNegated = nots.count % 2 === 1
      const paramStart = chain.next + conditionTerm.span + nots.offset

      // Officially a parameter must satisfy the condition word's
      // argtype; the first failure ends the sentence and the failed word
      // itself reparses as a new sentence — `baba feeling keke is you`
      // yields `keke is you`, while `baba on stop is you` yields nothing
      // (`stop` can never be a subject). Emit the failed tail's
      // subject-shaped words as bare subjects, dropping their `not`s —
      // they belong to the dead sentence's extra ids.
      const firstBadParam = chain.terms.findIndex(
        (term) => !isConditionParamWord(conditionKind, term.word),
      )
      if (firstBadParam !== -1) {
        for (const term of chain.terms.slice(firstBadParam)) {
          if (!isSubjectWord(term.word)) continue
          addPattern({
            subject: asSubjectWord(term.word),
            span: { start: 1, end: chain.next },
            subjectSourceIds: term.sourceIds,
          })
        }
        continue
      }

      const subjectChains = parseTermChainsWithNext(
        readTermsAt,
        paramStart,
        isSubjectWord,
        0,
        maxDepth,
        true,
        true,
      )
      // Keep every chain term: distinct formations carry their own
      // `ids[1]` sources — merging them could drop the `text_x` card that
      // rescues an otherwise-unstable `x is word` (official `findwordunits`
      // scans each featureindex entry separately).
      const subjects = subjectChains.chains.flatMap((chain) => chain.terms)
      const conditionTerms = chain.terms
      // No resolvable subject beyond the condition: the phrase fails at
      // the same point a stacked dead word's resume would land, and
      // official `finals` dedupes identical sentences (same unit ids), so
      // the bare `x is y` is emitted once here for both cases. Only
      // subject-shaped parameter words reparse — officially every type-0
      // word is a potential firstword (`stop near keke is you` still
      // yields `keke is you`), while a direction/property parameter like
      // `facing right is you` dies with the sentence.
      if (!subjects.length) {
        addSubjectTerms(
          conditionTerms.filter((term) => isSubjectWord(term.word)),
          { start: 1, end: chain.next },
        )
        continue
      }
      // Officially every word stacked on the condition cell spawns its
      // own sentence-start attempt; a dead word there (a noun/property —
      // anything that can't continue the subject phrase) fails its
      // variant, and parsing resumes at the failure point, so each
      // would-be condition object still emits a bare `x is y` rule.
      // `baba {near|keke} keke is push` therefore also yields
      // `keke is push` (Queue level 218 — `keke is push` at step 144).
      if (
        nextTerms.some(
          (term) =>
            term !== conditionTerm && !SENTENCE_CONTINUATION_WORDS.has(term.word),
        )
      )
        addSubjectTerms(conditionTerms, { start: 1, end: chain.next })
      const spanEnd = Math.max(
        chain.next + conditionTerm.span + nots.offset,
        ...subjectChains.chains.map((subjectChain) => subjectChain.next),
      )

      for (const term of conditionTerms) {
        for (const subject of subjects) {
          const condition: RuleCondition =
            conditionKind === 'facing' && isDirectionWord(term.word)
              ? {
                  kind: 'facing',
                  direction: term.word,
                  ...(term.negated !== conditionNegated
                    ? { negated: true }
                    : {}),
                }
              : conditionKind === 'facing'
                ? {
                    kind: 'facing',
                    object: asConditionObjectWord(term.word),
                    ...(conditionNegated ? { negated: true } : {}),
                    ...(term.negated ? { objectNegated: true } : {}),
                  }
                : {
                    kind: conditionKind,
                    object: asConditionObjectWord(term.word),
                    ...(conditionNegated ? { negated: true } : {}),
                    ...(term.negated ? { objectNegated: true } : {}),
                  }
          addPattern({
            subject: asSubjectWord(subject.word),
            ...(subject.negated ? { subjectNegated: true } : {}),
            condition,
            span: { start: 1, end: spanEnd },
            subjectSourceIds: subject.sourceIds,
          })
        }
      }
      continue
    }

    // Subjects are nouns only — officially a non-subject word ends the
    // sentence (`stop is wall`, `baba and stop is you` form nothing).
    if (!chain.terms.every((term) => isSubjectWord(term.word))) continue
    addSubjectTerms(chain.terms, { start: 1, end: chain.next })
  }

  return result
}

// `X IS A AND OP B`: in the predecessor engine, `and` after a completed
// predicate clause hands the same subject list to a following `is`/`has`,
// so `baba is weak and has box` yields both `baba is weak` and
// `baba has box`. Emulate that per-operator: when the cell immediately
// left of an `is`/`has` is `and` (possibly behind `not`s), walk left over
// the previous predicate clause to the `is`/`has` that owns it and reuse
// its subjects.
export const collectBridgedSubjectPatterns = (
  readTermsAt: ReadTermsAt,
  maxDepth: number,
): SubjectPattern[] => {
  let pos = 1
  for (;;) {
    const notTerm =
      pos <= maxDepth ? findTerm(readTermsAt(pos), 'not') : undefined
    if (!notTerm) break
    pos += notTerm.span
  }
  const andTerm = pos <= maxDepth ? findTerm(readTermsAt(pos), 'and') : undefined
  if (!andTerm) return []
  pos += andTerm.span

  const result: SubjectPattern[] = []
  let sawPredicate = false
  while (pos <= maxDepth) {
    const terms = readTermsAt(pos)
    if (!terms.length) break
    if (
      sawPredicate &&
      (findTerm(terms, 'is') !== undefined || findTerm(terms, 'has'))
    ) {
      const bridgedRead = (position: number): readonly ScannedTerm[] =>
        readTermsAt(position + pos)
      for (const pattern of collectSubjectPatterns(
        bridgedRead,
        maxDepth - pos,
      )) {
        result.push({
          ...pattern,
          span: {
            start: pattern.span.start + pos,
            end: pattern.span.end + pos,
          },
        })
      }
    }
    const stepTerm = terms.find(
      (term) =>
        term.word === 'and' ||
        term.word === 'not' ||
        isPredicateBridgeWord(term.word),
    )
    if (stepTerm) {
      if (isPredicateBridgeWord(stepTerm.word)) sawPredicate = true
      pos += stepTerm.span
      continue
    }
    break
  }
  return result
}

const isPredicateBridgeWord = (word: string): boolean =>
  PROPERTY_WORDS.has(word) || isObjectWord(word)

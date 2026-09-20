import {
  isSubjectWord,
  parseTermChainsWithNext,
  uniqueTerms,
} from './rules-parse.js'

import {
  asConditionObjectWord,
  asSubjectWord,
  isDirectionWord,
  isObjectWord,
  INFIX_CONDITION_WORDS,
  POSTFIX_CONDITION_WORDS,
  PROPERTY_WORDS,
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
}

const CONDITION_OPERATOR_WORDS = INFIX_CONDITION_WORDS

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
  return `if:${condition.kind}:${condition.negated ? '!' : ''}${condition.object}`
}

export const collectSubjectPatterns = (
  readTermsAt: ReadTermsAt,
  maxDepth: number,
): SubjectPattern[] => {
  const result: SubjectPattern[] = []
  const seen = new Set<string>()

  const addPattern = (subject: SubjectPattern): void => {
    const key = `${subject.subjectNegated ? '!' : ''}${subject.subject}:${stringifyCondition(
      subject.condition,
    )}`
    if (seen.has(key)) return
    seen.add(key)
    result.push(subject)
  }

  const addSubjectTerms = (
    subjectTerms: Array<{ word: string; negated: boolean }>,
    span: { start: number; end: number },
    condition?: RuleCondition,
  ): void => {
    const subjects = uniqueTerms([subjectTerms])
    for (const subject of subjects) {
      addPattern({
        subject: asSubjectWord(subject.word),
        ...(subject.negated ? { subjectNegated: true } : {}),
        ...(condition ? { condition } : {}),
        span,
      })
    }
  }

  const subjectOrConditionChains = parseTermChainsWithNext(
    readTermsAt,
    1,
    isSubjectWord,
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
      const subjectChains = parseTermChainsWithNext(
        readTermsAt,
        chain.next + conditionTerm.span,
        isSubjectWord,
        0,
        maxDepth,
        true,
        true,
      )
      const subjects = uniqueTerms(subjectChains.chains.map((c) => c.terms))
      const conditionTerms = uniqueTerms([chain.terms])
      if (!subjects.length) {
        addSubjectTerms(conditionTerms, { start: 1, end: chain.next })
        continue
      }
      const spanEnd = Math.max(
        chain.next + conditionTerm.span,
        ...subjectChains.chains.map((subjectChain) => subjectChain.next),
      )

      for (const term of conditionTerms) {
        for (const subject of subjects) {
          const condition: RuleCondition =
            conditionKind === 'facing' && isDirectionWord(term.word)
              ? {
                  kind: 'facing',
                  direction: term.word,
                  ...(term.negated ? { negated: true } : {}),
                }
              : conditionKind === 'facing'
                ? {
                    kind: 'facing',
                    object: asConditionObjectWord(term.word),
                    ...(term.negated ? { negated: true } : {}),
                  }
                : {
                    kind: conditionKind,
                    object: asConditionObjectWord(term.word),
                    ...(term.negated ? { negated: true } : {}),
                  }
          addPattern({
            subject: asSubjectWord(subject.word),
            ...(subject.negated ? { subjectNegated: true } : {}),
            condition,
            span: { start: 1, end: spanEnd },
          })
        }
      }
      continue
    }

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

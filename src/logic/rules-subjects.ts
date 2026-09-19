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

const countConsecutiveNot = (
  readWordsAt: (position: number) => string[],
  position: number,
): number => {
  let count = 0
  while (readWordsAt(position + count).includes('not')) count += 1
  return count
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
  readWordsAt: (position: number) => string[],
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
    readWordsAt,
    1,
    isSubjectWord,
    0,
    maxDepth,
    true,
    true,
  )

  for (const chain of subjectOrConditionChains.chains) {
    const nextWords = readWordsAt(chain.next)

    const postfixKind = nextWords.find((word) =>
      POSTFIX_CONDITION_WORD_SET.has(word),
    )
    if (postfixKind) {
      const notCount = countConsecutiveNot(readWordsAt, chain.next + 1)
      addSubjectTerms(
        chain.terms,
        { start: 1, end: chain.next + 1 + notCount },
        {
          kind: postfixKind as PostfixConditionKind,
          ...(notCount % 2 === 1 ? { negated: true } : {}),
        },
      )
      continue
    }

    const conditionKind = CONDITION_OPERATOR_WORDS.find((word) =>
      nextWords.includes(word),
    )
    if (conditionKind) {
      const subjectChains = parseTermChainsWithNext(
        readWordsAt,
        chain.next + 1,
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
        chain.next + 1,
        ...subjectChains.chains.map((subjectChain) => subjectChain.next),
      )

      for (const conditionTerm of conditionTerms) {
        for (const subject of subjects) {
          const condition: RuleCondition =
            conditionKind === 'facing' && isDirectionWord(conditionTerm.word)
              ? {
                  kind: 'facing',
                  direction: conditionTerm.word,
                  ...(conditionTerm.negated ? { negated: true } : {}),
                }
              : conditionKind === 'facing'
                ? {
                    kind: 'facing',
                    object: asConditionObjectWord(conditionTerm.word),
                    ...(conditionTerm.negated ? { negated: true } : {}),
                  }
                : {
                    kind: conditionKind,
                    object: asConditionObjectWord(conditionTerm.word),
                    ...(conditionTerm.negated ? { negated: true } : {}),
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
  readWordsAt: (position: number) => string[],
  maxDepth: number,
): SubjectPattern[] => {
  let pos = 1
  while (pos <= maxDepth && readWordsAt(pos).includes('not')) pos += 1
  if (pos > maxDepth || !readWordsAt(pos).includes('and')) return []
  pos += 1

  const result: SubjectPattern[] = []
  let sawPredicate = false
  while (pos <= maxDepth) {
    const words = readWordsAt(pos)
    if (!words.length) break
    if (sawPredicate && (words.includes('is') || words.includes('has'))) {
      const bridgedRead = (position: number): string[] =>
        readWordsAt(position + pos)
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
    if (
      words.some(
        (word) =>
          word === 'and' || word === 'not' || isPredicateBridgeWord(word),
      )
    ) {
      if (words.some((word) => isPredicateBridgeWord(word)))
        sawPredicate = true
      pos += 1
      continue
    }
    break
  }
  return result
}

const isPredicateBridgeWord = (word: string): boolean =>
  PROPERTY_WORDS.has(word) || isObjectWord(word)

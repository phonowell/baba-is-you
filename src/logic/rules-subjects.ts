import {
  isSubjectWord,
  parseTermChains,
  parseTermChainsWithNext,
  uniqueTerms,
} from './rules-parse.js'

import {
  asConditionObjectWord,
  asSubjectWord,
  isDirectionWord,
} from './types.js'

import type { RuleCondition } from './types.js'

type SubjectPattern = {
  subject: ReturnType<typeof asSubjectWord>
  subjectNegated?: boolean
  condition?: RuleCondition
}

const CONDITION_OPERATOR_WORDS = ['on', 'near', 'facing'] as const

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
  if (condition.kind === 'lonely')
    return `if:${condition.negated ? '!' : ''}lonely`
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
    condition?: RuleCondition,
  ): void => {
    const subjects = uniqueTerms([subjectTerms])
    for (const subject of subjects) {
      addPattern({
        subject: asSubjectWord(subject.word),
        ...(subject.negated ? { subjectNegated: true } : {}),
        ...(condition ? { condition } : {}),
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

    if (nextWords.includes('lonely')) {
      const lonelyNegated =
        countConsecutiveNot(readWordsAt, chain.next + 1) % 2 === 1
      addSubjectTerms(chain.terms, {
        kind: 'lonely',
        ...(lonelyNegated ? { negated: true } : {}),
      })
      continue
    }

    const conditionKind = CONDITION_OPERATOR_WORDS.find((word) =>
      nextWords.includes(word),
    )
    if (conditionKind) {
      const subjectChains = parseTermChains(
        readWordsAt,
        chain.next + 1,
        isSubjectWord,
        0,
        maxDepth,
        true,
        true,
      )
      const subjects = uniqueTerms(subjectChains.chains)
      const conditionTerms = uniqueTerms([chain.terms])
      if (!subjects.length) {
        addSubjectTerms(conditionTerms)
        continue
      }

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
          })
        }
      }
      continue
    }

    addSubjectTerms(chain.terms)
  }

  return result
}

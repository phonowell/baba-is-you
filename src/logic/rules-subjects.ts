import {
  isSubjectWord,
  parseTermChains,
  parseTermChainsWithNext,
  uniqueTerms,
} from './rules-parse.js'

import type { RuleCondition } from './types.js'

type SubjectPattern = {
  subject: string
  subjectNegated?: boolean
  condition?: RuleCondition
}

const CONDITION_OPERATOR_WORDS = ['on', 'near', 'facing'] as const

export const stringifyCondition = (condition?: RuleCondition): string => {
  if (!condition) return ''
  if (condition.kind === 'lonely')
    return `if:${condition.negated ? '!' : ''}lonely`

  return `if:${condition.kind}:${condition.objectNegated ? '!' : ''}${condition.object}`
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
        subject: subject.word,
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
      const lonelyNegated = readWordsAt(chain.next + 1).includes('not')
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
          addPattern({
            subject: subject.word,
            ...(subject.negated ? { subjectNegated: true } : {}),
            condition: {
              kind: conditionKind,
              object: conditionTerm.word,
              ...(conditionTerm.negated ? { objectNegated: true } : {}),
            },
          })
        }
      }
      continue
    }

    addSubjectTerms(chain.terms)
  }

  return result
}

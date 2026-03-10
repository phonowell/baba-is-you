import {
  asConditionObjectWord,
  asObjectWord,
  asSubjectWord,
} from './types.js'

import type { Rule, RuleCondition, RuleKind } from './types.js'

type RuleConditionInput =
  | {
      kind: 'on' | 'near'
      object: string
      negated?: boolean
    }
  | {
      kind: 'facing'
      object: string
      negated?: boolean
    }
  | {
      kind: 'facing'
      direction: RuleCondition extends { kind: 'facing'; direction: infer D }
        ? D
        : never
      negated?: boolean
    }
  | {
      kind: 'lonely'
      negated?: boolean
    }

type RuleInput = {
  subject: string
  subjectNegated?: boolean
  object: string
  objectNegated?: boolean
  kind: RuleKind | 'property' | 'transform'
  condition?: RuleConditionInput
}

const normalizeRuleKind = (
  kind: RuleInput['kind'],
): RuleKind => {
  if (kind === 'property') return 'is-property'
  if (kind === 'transform') return 'is-transform'
  return kind
}

const toRuleCondition = (condition: RuleConditionInput): RuleCondition => {
  if ('direction' in condition || condition.kind === 'lonely')
    return condition

  return {
    ...condition,
    object: asConditionObjectWord(condition.object),
  }
}

export const rule = (input: RuleInput): Rule => ({
  subject: asSubjectWord(input.subject),
  ...(input.subjectNegated ? { subjectNegated: true } : {}),
  object: asObjectWord(input.object),
  ...(input.objectNegated ? { objectNegated: true } : {}),
  kind: normalizeRuleKind(input.kind),
  ...(input.condition ? { condition: toRuleCondition(input.condition) } : {}),
})

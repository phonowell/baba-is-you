import { ruleOperatorForKind } from '../logic/types.js'

import type { Rule } from '../logic/types.js'

// Plain-text rule lines for the web reference dialog.
export const renderRules = (rules: Rule[]): string[] => {
  if (!rules.length) return ['(no rules)']

  return rules
    .map((rule) => {
      const subject =
        `${rule.subjectNegated ? 'NOT ' : ''}${rule.subject}`.toUpperCase()
      const condition = !rule.condition
        ? ''
        : rule.condition.kind === 'lonely'
          ? ` ${rule.condition.negated ? 'NOT ' : ''}LONELY`
          : 'direction' in rule.condition
            ? ` FACING ${rule.condition.negated ? 'NOT ' : ''}${rule.condition.direction.toUpperCase()}`
            : ` ${rule.condition.kind.toUpperCase()} ${rule.condition.negated ? 'NOT ' : ''}${rule.condition.object.toUpperCase()}`
      const verb = ruleOperatorForKind(rule.kind).toUpperCase()
      const object =
        `${rule.objectNegated ? 'NOT ' : ''}${rule.object}`.toUpperCase()
      return `${subject}${condition} ${verb} ${object}`
    })
    .sort()
}

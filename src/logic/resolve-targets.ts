import type { Rule } from './types.js'

export const resolveRuleTargets = <T>(
  item: T,
  rules: Rule[],
  matchesRule: (item: T, rule: Rule) => boolean,
): string[] => {
  const yes = new Set<string>()
  const no = new Set<string>()

  for (const rule of rules) {
    if (!matchesRule(item, rule)) continue
    if (rule.objectNegated) no.add(rule.object)
    else yes.add(rule.object)
  }

  return Array.from(yes).filter((target) => !no.has(target))
}

import { collectRuleInstances } from './rules.js'
import { stringifyCondition } from './rules-subjects.js'

import type { LevelItem, Rule } from './types.js'
import type { RuleInstance } from './rules.js'

// Port of the predecessor's `partition_overridden_rules`: positive rules
// vetoed by a matching `NOT` rule (same predicate, compatible subject)
// are removed from the active set; so are `x is noun` rules suppressed by
// `x is x`. Overridden rules carry no gameplay effect — they exist only so
// their text can be rendered struck-out.
export const partitionRuleInstances = (
  instances: RuleInstance[],
): { active: RuleInstance[]; overridden: RuleInstance[] } => {
  const noRules = instances.filter((i) => i.rule.objectNegated)
  const yesRules = instances.filter((i) => !i.rule.objectNegated)

  // Veto candidates must share kind/object/condition — index that triple
  // once so each yes-rule probes only its compatible no-rules instead of
  // scanning (and re-stringifying) the whole set.
  const noRuleKey = (rule: Rule): string =>
    `${rule.kind}\u0000${rule.object}\u0000${stringifyCondition(rule.condition)}`
  const noRulesByKey = new Map<string, RuleInstance[]>()
  for (const noRule of noRules) {
    const key = noRuleKey(noRule.rule)
    const list = noRulesByKey.get(key) ?? []
    list.push(noRule)
    noRulesByKey.set(key, list)
  }

  const vetoed = new Set<RuleInstance>()
  for (const yesRule of yesRules) {
    const overridden = (noRulesByKey.get(noRuleKey(yesRule.rule)) ?? []).some(
      (noRule) => {
        const r = yesRule.rule
        const n = noRule.rule
        if (!r.subjectNegated && n.subjectNegated)
          return r.subject !== n.subject
        return (
          r.subject === n.subject && !r.subjectNegated === !n.subjectNegated
        )
      },
    )
    if (overridden) vetoed.add(yesRule)
  }

  const unchangingSubjects = new Set<string>()
  for (const instance of yesRules) {
    if (vetoed.has(instance)) continue
    const { rule } = instance
    if (
      rule.kind === 'is-transform' &&
      !rule.subjectNegated &&
      (rule.object as string) === rule.subject
    )
      unchangingSubjects.add(rule.subject)
  }

  const overridden = new Set<RuleInstance>(vetoed)
  for (const instance of yesRules) {
    if (vetoed.has(instance)) continue
    const { rule } = instance
    if (
      rule.kind === 'is-transform' &&
      !rule.subjectNegated &&
      (rule.object as string) !== rule.subject &&
      unchangingSubjects.has(rule.subject)
    )
      overridden.add(instance)
  }

  const active: RuleInstance[] = []
  const overriddenList: RuleInstance[] = []
  for (const instance of instances) {
    if (overridden.has(instance)) overriddenList.push(instance)
    else active.push(instance)
  }
  return { active, overridden: overriddenList }
}

// Both marks in one scan: `active` = text ids in any active rule,
// `overridden` = text ids in overridden rules only.
export const collectTextRuleMarks = (
  items: LevelItem[],
  width: number,
  height: number,
): { active: Set<number>; overridden: Set<number> } => {
  const { active, overridden } = partitionRuleInstances(
    collectRuleInstances(items, width, height),
  )
  const activeIds = new Set<number>()
  for (const instance of active)
    for (const id of instance.cells) activeIds.add(id)

  const overriddenIds = new Set<number>()
  for (const instance of overridden)
    for (const id of instance.cells)
      if (!activeIds.has(id)) overriddenIds.add(id)
  return { active: activeIds, overridden: overriddenIds }
}

// Ids of text items forming overridden rules but no active rule — the
// predecessor renders exactly this set struck-out/dimmed.
export const collectOverriddenTextIds = (
  items: LevelItem[],
  width: number,
  height: number,
): Set<number> =>
  collectTextRuleMarks(items, width, height).overridden

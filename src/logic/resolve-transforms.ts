import { createEmptyMatchContext, resolveEmptyRuleTargetsAt } from './empty.js'
import { resolveRuleTargets } from './helpers.js'
import { matchesRuleSubject } from './rule-match.js'

import type { RuleRuntime } from './rule-runtime.js'
import type { LevelItem, Rule } from './types.js'

const toTransformed = (item: LevelItem, target: string): LevelItem | null => {
  if (target === 'empty') return null

  if (target === 'text') {
    return {
      ...item,
      name: item.isText ? 'text' : item.name,
      isText: true,
      originName: item.originName ?? item.name,
    }
  }

  return {
    ...item,
    name: target,
    isText: false,
    // The official `ogname` is the unit's birth name — the first rename
    // records it so `x is revert` can transform back. Once set it stays
    // sticky across further transforms.
    originName: item.originName ?? item.name,
  }
}

// `x is revert` converts the entity back to the kind it originally was
// (official `ogname`); entities never transformed revert to themselves.
const resolveTransformTarget = (item: LevelItem, target: string): string =>
  target === 'revert' ? (item.originName ?? item.name) : target

const transformVariants = (
  item: LevelItem,
  target: string,
  allTargets: string[],
): LevelItem[] => {
  if (target === 'all') {
    return allTargets
      .map((name) => toTransformed(item, name))
      .filter((value): value is LevelItem => value !== null)
  }

  const transformed = toTransformed(item, target)
  if (!transformed) return []
  return [transformed]
}

const createFromEmpty = (
  id: number,
  x: number,
  y: number,
  target: string,
): LevelItem | null => {
  if (target === 'empty') return null
  if (target === 'text') {
    return {
      id,
      name: 'empty',
      x,
      y,
      isText: true,
    }
  }

  return {
    id,
    name: target,
    x,
    y,
    isText: false,
  }
}

export const applyTransforms = (
  items: LevelItem[],
  runtime: RuleRuntime,
): {
  items: LevelItem[]
  changed: boolean
} => {
  const { context, height, width } = runtime
  const transformRules = runtime.buckets.isTransform
  if (!transformRules.length) return { items, changed: false }
  const allTargets = Array.from(
    new Set(items.filter((item) => !item.isText).map((item) => item.name)),
  )

  const next: LevelItem[] = []
  let nextId = items.reduce((max, item) => Math.max(max, item.id), 0) + 1
  let changed = false

  // `become` shares the transform pipeline but is resolved separately:
  // only `x is x`-style identity targets veto the whole transform set —
  // `x become x` (or a `revert` that resolves to the current kind) is a
  // silent no-op, matching the official convert() where same-name become
  // still fires without suppressing other transforms.
  const isTransformRules = transformRules.filter(
    (rule) => rule.kind === 'is-transform',
  )
  const becomeRules = transformRules.filter(
    (rule) => rule.kind === 'become',
  )

  for (const item of items) {
    const resolveTargets = (rules: Rule[]) =>
      resolveRuleTargets(item, rules, (candidate, rule) =>
        matchesRuleSubject(candidate, rule, context),
      )
    const isTargets = resolveTargets(isTransformRules)
    const becomeTargets = resolveTargets(becomeRules)
    if (!isTargets.length && !becomeTargets.length) {
      next.push(item)
      continue
    }

    const transformedByKey = new Map<string, LevelItem>()
    let vetoed = false
    const collectVariants = (targets: string[], vetoOnIdentity: boolean) => {
      for (const target of targets) {
        const variants = transformVariants(
          item,
          resolveTransformTarget(item, target),
          allTargets,
        )
        for (const variant of variants) {
          const identity =
            variant.name === item.name && variant.isText === item.isText
          if (identity) {
            if (vetoOnIdentity) vetoed = true
            continue
          }
          transformedByKey.set(
            `${variant.isText ? '1' : '0'}:${variant.name}`,
            variant,
          )
        }
      }
    }
    collectVariants(isTargets, true)
    collectVariants(becomeTargets, false)

    // `x is x` vetoes every transform for x (predecessor `is_noun` returns
    // no targets when the entity itself is among them), e.g.
    // `flag is flag` + `flag is jelly` leaves flag unchanged.
    if (vetoed) {
      next.push(item)
      continue
    }

    const transformed = Array.from(transformedByKey.values())
    if (!transformed.length) {
      changed = true
      continue
    }

    changed = true
    const first = transformed[0]
    if (!first) continue
    next.push({ ...first, id: item.id })
    for (const rest of transformed.slice(1))
      next.push({ ...rest, id: nextId++ })
  }

  const emptyTransformRules = transformRules.filter(
    (rule) => rule.subject === 'empty' && !rule.subjectNegated,
  )
  if (emptyTransformRules.length) {
    const emptyContext = createEmptyMatchContext(next, runtime.rules, width, height)
    const occupied = new Set<number>()
    for (const item of next) occupied.add(item.y * width + item.x)

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const cellKey = y * width + x
        if (occupied.has(cellKey)) continue
        const emptyTargets = [
          ...resolveEmptyRuleTargetsAt(
            emptyTransformRules,
            emptyContext,
            x,
            y,
            'is-transform',
          ),
          ...resolveEmptyRuleTargetsAt(
            emptyTransformRules,
            emptyContext,
            x,
            y,
            'become',
          ),
        ]
        if (!emptyTargets.length) continue

        for (const target of emptyTargets) {
          const spawned = createFromEmpty(nextId, x, y, target)
          if (!spawned) continue
          next.push(spawned)
          nextId += 1
          changed = true
        }
      }
    }
  }

  return { items: next, changed }
}

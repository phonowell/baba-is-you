import {
  createEmptyMatchContext,
  resolveEmptyNegatedObjectsAt,
  resolveEmptyRuleTargetsAt,
} from './empty.js'
import { resolveRuleTargets } from './helpers.js'
import { isLetterName } from './letter-words.js'
import { matchesRuleSubject } from './rule-match.js'

import type { RuleRuntime } from './rule-runtime.js'
import {
  isDirectionWord,
  isPropertyWord,
  isSpecialNounWord,
  RULE_SYNTAX_WORDS,
} from './types.js'

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
): LevelItem[] => {
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
  // Official `emptydata[tileid].conv` — cells that already fired an
  // empty conversion never fire again. Callers that persist the set pass
  // it in; it is read for gating and written when an empty cell spawns
  // or an entity converts to `empty`.
  emptyConverted?: Set<number>,
): {
  items: LevelItem[]
  changed: boolean
} => {
  const { context, height, width } = runtime
  const transformRules = runtime.buckets.isTransform
  if (!transformRules.length) return { items, changed: false }
  // The official `objectlist` backing `x is all` registers every placed
  // non-text unit plus the noun each type-0 `text_X` word refers to —
  // so `rock is all` can spawn `love` even when no love unit exists.
  const allTargets = Array.from(
    new Set(
      items
        .map((item) => item.name)
        .filter(
          (name) =>
            !isPropertyWord(name) &&
            !isSpecialNounWord(name) &&
            !isDirectionWord(name) &&
            !isLetterName(name) &&
            !RULE_SYNTAX_WORDS.has(name),
        ),
    ),
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
    const spawnedByKey = new Map<string, LevelItem>()
    let vetoed = false
    // `x is not b` rules protect object b from an `x is all` spawn
    // (official createall_single checks `x is not b` before creating).
    const negated = new Set<string>()
    for (const rule of isTransformRules) {
      if (rule.objectNegated && matchesRuleSubject(item, rule, context))
        negated.add(rule.object)
    }
    const namesAtCell = new Set(
      items
        .filter(
          (other) =>
            other.id !== item.id &&
            other.x === item.x &&
            other.y === item.y &&
            !other.isText,
        )
        .map((other) => other.name),
    )
    const collectVariants = (targets: string[], vetoOnIdentity: boolean) => {
      for (const target of targets) {
        const resolved = resolveTransformTarget(item, target)
        // `x is all` keeps the source and stacks one of every other
        // object name at the cell — it is additive, not a transform,
        // so it never participates in the identity veto below.
        if (resolved === 'all') {
          for (const name of allTargets) {
            if (name === item.name || negated.has(name)) continue
            if (namesAtCell.has(name)) continue
            const variant = toTransformed(item, name)
            if (variant) spawnedByKey.set(`0:${name}`, variant)
          }
          continue
        }
        const variants = transformVariants(item, resolved)
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

    const spawned = Array.from(spawnedByKey.values())
    const pushSpawned = () => {
      for (const variant of spawned) next.push({ ...variant, id: nextId++ })
      if (spawned.length) changed = true
    }

    // `x is x` vetoes every transform for x (predecessor `is_noun` returns
    // no targets when the entity itself is among them), e.g.
    // `flag is flag` + `flag is jelly` leaves flag unchanged.
    if (vetoed) {
      next.push(item)
      pushSpawned()
      continue
    }

    // `x is empty` deletes the unit and conv-marks its cell — an
    // `empty is …` spawn can never fire there again (official
    // convert.lua marks `emptydata[tileid].conv` on empty targets).
    if (
      emptyConverted !== undefined &&
      [...isTargets, ...becomeTargets].some(
        (target) => resolveTransformTarget(item, target) === 'empty',
      )
    ) {
      emptyConverted.add(item.y * width + item.x)
    }

    const transformed = Array.from(transformedByKey.values())
    const resolvedTargets = [...isTargets, ...becomeTargets].map((target) =>
      resolveTransformTarget(item, target),
    )
    const keepsSource =
      resolvedTargets.includes('all') && !resolvedTargets.includes('empty')
    if (!transformed.length) {
      // Pure `x is all` leaves the source in place; `x is empty`
      // still deletes it.
      if (keepsSource) {
        next.push(item)
        pushSpawned()
      } else {
        changed = true
      }
      continue
    }

    changed = true
    const first = transformed[0]
    if (!first) continue
    next.push({ ...first, id: item.id })
    for (const rest of transformed.slice(1))
      next.push({ ...rest, id: nextId++ })
    pushSpawned()
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
        // One-shot per cell: the official `conv` flag makes a converted
        // empty cell permanently ineligible, even if it empties again.
        if (emptyConverted?.has(cellKey)) continue
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
          // `empty is all` stacks one of every object name at the cell
          // (respecting `empty is not b` protection). Officially the
          // createall branch never sets the `conv` flag — the cell is
          // occupied afterwards, so it cannot refire until emptied.
          if (target === 'all') {
            const emptyNegated = new Set<string>([
              ...resolveEmptyNegatedObjectsAt(
                emptyTransformRules,
                emptyContext,
                x,
                y,
                'is-transform',
              ),
              ...resolveEmptyNegatedObjectsAt(
                emptyTransformRules,
                emptyContext,
                x,
                y,
                'become',
              ),
            ])
            for (const name of allTargets) {
              if (emptyNegated.has(name)) continue
              next.push({ id: nextId, name, x, y, isText: false })
              nextId += 1
              changed = true
            }
            continue
          }
          const spawned = createFromEmpty(nextId, x, y, target)
          if (!spawned) continue
          next.push(spawned)
          nextId += 1
          changed = true
          emptyConverted?.add(cellKey)
        }
      }
    }
  }

  return { items: next, changed }
}

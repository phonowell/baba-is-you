import { resolveActiveEmptyProps } from '../empty.js'
import { keyFor } from '../helpers.js'
import { matchesRuleObjectWord, matchesRuleSubject } from '../rule-match.js'

import {
  appendHasSpawns,
  buildGrid,
  hasProp,
  isYouLike,
  resolveLevelPropsGlobal,
  splitByFloatLayer,
} from './shared.js'

import type { RuleRuntime } from '../rule-runtime.js'
import type { Item } from '../types.js'

const applyOpenShut = (
  items: Item[],
  removed: Set<number>,
  removable: (item: Item) => boolean,
): boolean => {
  const opens = items.filter((item) => hasProp(item, 'open'))
  const shuts = items.filter((item) => hasProp(item, 'shut'))
  const pairCount = Math.min(opens.length, shuts.length)
  if (!pairCount) return false

  let changed = false
  for (let i = 0; i < pairCount; i += 1) {
    const open = opens[i]
    const shut = shuts[i]
    if (open && removable(open) && !removed.has(open.id)) {
      removed.add(open.id)
      changed = true
    }
    if (shut && removable(shut) && !removed.has(shut.id)) {
      removed.add(shut.id)
      changed = true
    }
  }

  return changed
}

const INTERACTION_PROPS = new Set([
  'bonus',
  'boom',
  'defeat',
  'hot',
  'melt',
  'open',
  'shut',
  'sink',
  'weak',
])

export const applyInteractions = (
  items: Item[],
  runtime: RuleRuntime,
): { items: Item[]; changed: boolean } => {
  const { height, width } = runtime
  const eatRules = runtime.buckets.eat
  const levelRules = runtime.buckets.level
  const hasLevelRules =
    levelRules.length > 0 ||
    eatRules.some(
      (rule) =>
        !rule.subjectNegated &&
        (rule.subject === 'level' || rule.object === 'level'),
    )
  // Board-level prop census, collected during the gate scan: cells holding
  // none of these props can't interact at all, and each per-layer check
  // gets an O(1) board guard before it scans.
  const presentProps = new Set<string>()
  for (const item of items)
    for (const prop of item.props)
      if (INTERACTION_PROPS.has(prop)) presentProps.add(prop)
  const hasInteractionProps = presentProps.size > 0 || hasLevelRules
  if (!hasInteractionProps && !eatRules.length) return { items, changed: false }

  // The stage runtime's match context already indexes this exact items
  // array by cell — reuse it when it is the same array instead of building
  // an identical map (the cells hold Item objects, only typed MatchItem).
  const byCell =
    runtime.context.items === items
      ? (runtime.context.byCell as Map<number, Item[]>)
      : buildGrid(items, width)

  const removed = new Set<number>()
  let changed = false
  const ruleContext = runtime.context

  // `safe` units survive every interaction removal; `phantom` units sit
  // outside the interaction system entirely.
  const removable = (item: Item): boolean =>
    !hasProp(item, 'safe') && !hasProp(item, 'phantom')
  const markRemoved = (item: Item): void => {
    if (removable(item) && !removed.has(item.id)) {
      removed.add(item.id)
      changed = true
    }
  }

  for (const list of byCell.values()) {
    // A cell can only interact when some resident carries an interaction
    // prop — or when eat rules exist and a same-layer pair is possible
    // (an eater can't eat itself, so a lone item never eats).
    const cellHasProp =
      presentProps.size > 0 &&
      list.some((item) =>
        item.props.some((prop) => presentProps.has(prop)),
      )
    const cellCanEat = eatRules.length > 0 && list.length > 1
    if (!cellHasProp && !cellCanEat) continue

    for (const layer of splitByFloatLayer(list)) {
      if (!layer.length) continue
      const occupied = layer.length > 1

      if (occupied && presentProps.has('sink')) {
        const hasSink = layer.some((item) => hasProp(item, 'sink'))
        if (hasSink) {
          for (const item of layer) markRemoved(item)
        }
      }

      if (presentProps.has('defeat') && layer.some((item) => hasProp(item, 'defeat'))) {
        for (const item of layer) {
          if (isYouLike(item)) markRemoved(item)
        }
      }

      // `bonus` is a pickup: a you-like unit touching it removes the
      // bonus (without ending the level).
      if (
        presentProps.has('bonus') &&
        layer.some((item) => isYouLike(item)) &&
        layer.some((item) => hasProp(item, 'bonus'))
      ) {
        for (const item of layer) {
          if (hasProp(item, 'bonus')) markRemoved(item)
        }
      }

      if (
        presentProps.has('hot') &&
        presentProps.has('melt') &&
        layer.some((item) => hasProp(item, 'hot'))
      ) {
        for (const item of layer) {
          if (hasProp(item, 'melt')) markRemoved(item)
        }
      }

      if (presentProps.has('open') && presentProps.has('shut')) {
        const openShutChanged = applyOpenShut(layer, removed, removable)
        if (openShutChanged) changed = true
      }

      if (eatRules.length) {
        for (const eater of layer) {
          if (removed.has(eater.id)) continue
          for (const rule of eatRules) {
            if (!matchesRuleSubject(eater, rule, ruleContext)) continue

            for (const target of layer) {
              if (target.id === eater.id) continue
              if (removed.has(target.id)) continue

              const targetMatched = matchesRuleObjectWord(
                target,
                rule.object,
                ruleContext.groupMembers,
              )
              const shouldEat = rule.objectNegated
                ? !targetMatched
                : targetMatched
              if (!shouldEat) continue
              markRemoved(target)
            }
          }
        }
      }

      if (occupied && presentProps.has('weak')) {
        for (const item of layer) {
          if (hasProp(item, 'weak')) markRemoved(item)
        }
      }
    }
  }

  // `boom` detonates its whole 3x3 neighbourhood — every unit in the
  // eight surrounding cells plus itself goes.
  if (presentProps.has('boom')) {
    for (const source of items) {
      if (!hasProp(source, 'boom')) continue
      markRemoved(source)
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue
          const cell =
            byCell.get(keyFor(source.x + dx, source.y + dy, width)) ?? []
          for (const item of cell) markRemoved(item)
        }
      }
    }
  }

  // `level is <prop>` applies globally — the level is a virtual entity
  // touching every unit on its float layer (official `floating_level`):
  // `defeat` kills all `you`s, `hot` melts all `melt`s, `open`/`shut`
  // mass-unlock their counterparts, `sink`/`boom` wipe the room, and
  // `weak`/`melt`/paired `open`/`shut` or an eaten level `destroylevel`
  // (mapped to clearing the room, which the lose check catches).
  // Conditional level rules are OR'd across the border cells
  // (`resolveLevelPropsGlobal`).
  if (hasLevelRules) {
    const levelProps = resolveLevelPropsGlobal(
      levelRules,
      runtime.context,
      width,
      height,
    )
    const levelFloat = levelProps.has('float')
    const levelSafe = levelProps.has('safe')
    const floatOk = (item: Item): boolean =>
      hasProp(item, 'float') === levelFloat
    const levelYou =
      levelProps.has('you') || levelProps.has('you2') || levelProps.has('3d')
    const eProps = resolveActiveEmptyProps(
      runtime.rules,
      items,
      width,
      height,
      runtime.context,
    )
    const emptyFloatMatch = eProps.has('float') === levelFloat

    let destroyLevel = false
    if (!levelSafe) {
      if (levelProps.has('weak') && items.some(floatOk)) destroyLevel = true
      if (
        levelProps.has('melt') &&
        (levelProps.has('hot') ||
          items.some((item) => floatOk(item) && hasProp(item, 'hot')) ||
          (eProps.has('hot') && emptyFloatMatch))
      )
        destroyLevel = true
      if (
        levelProps.has('open') &&
        (levelProps.has('shut') || (eProps.has('shut') && emptyFloatMatch))
      )
        destroyLevel = true
      if (
        levelProps.has('shut') &&
        (levelProps.has('open') || (eProps.has('open') && emptyFloatMatch))
      )
        destroyLevel = true
      if (
        (levelProps.has('sink') || levelProps.has('boom')) &&
        items.some(floatOk)
      )
        destroyLevel = true
      // `level is you`: the level touches everything — `x is defeat`
      // (units, the level itself, or empty cells) destroys it.
      if (levelYou) {
        if (
          levelProps.has('defeat') ||
          (eProps.has('defeat') && emptyFloatMatch)
        )
          destroyLevel = true
        else
          for (const rule of runtime.rules) {
            if (destroyLevel) break
            if (
              rule.kind === 'is-property' &&
              rule.object === 'defeat' &&
              !rule.objectNegated &&
              !rule.subjectNegated &&
              rule.subject !== 'level' &&
              rule.subject !== 'empty' &&
              items.some(
                (item) =>
                  floatOk(item) &&
                  matchesRuleObjectWord(
                    item,
                    rule.subject,
                    runtime.context.groupMembers,
                  ),
              )
            )
              destroyLevel = true
          }
      }
      // `x eat level` / `empty eat level` / `level eat level` destroy the
      // room (official `destroylevel`).
      for (const rule of eatRules) {
        if (destroyLevel) break
        if (rule.object !== 'level' || rule.objectNegated) continue
        if (rule.subject === 'level') destroyLevel = true
        else if (rule.subject === 'empty') {
          if (runtime.context.byCell.size < width * height)
            destroyLevel = true
        } else if (
          !rule.subjectNegated &&
          items.some((item) =>
            matchesRuleObjectWord(
              item,
              rule.subject,
              runtime.context.groupMembers,
            ),
          )
        )
          destroyLevel = true
      }
    }
    if (destroyLevel) return { items: [], changed: true }

    for (const item of items) {
      if (removed.has(item.id) || !floatOk(item)) continue
      if (levelProps.has('defeat') && isYouLike(item)) markRemoved(item)
      if (levelProps.has('hot') && hasProp(item, 'melt')) markRemoved(item)
      if (levelProps.has('open') && hasProp(item, 'shut')) markRemoved(item)
      if (levelProps.has('shut') && hasProp(item, 'open')) markRemoved(item)
      if (levelProps.has('sink') || levelProps.has('boom')) markRemoved(item)
      // `level is you` picks up every `bonus` on the level.
      if (levelYou && hasProp(item, 'bonus')) markRemoved(item)
      // `level eat x` swallows every matching unsafe unit.
      for (const rule of eatRules) {
        if (rule.subject !== 'level' || rule.subjectNegated) continue
        // Officially `level eat all`/`empty` are skipped by the eat
        // branch (all→no handler, empty→deletes invisible empties).
        if (
          rule.object === 'level' ||
          rule.object === 'empty' ||
          rule.object === 'all'
        )
          continue
        const matched = matchesRuleObjectWord(
          item,
          rule.object,
          runtime.context.groupMembers,
        )
        if (rule.objectNegated ? !matched : matched) markRemoved(item)
      }
    }
  }

  if (!removed.size) return { items, changed }

  const survivors = items.filter((item) => !removed.has(item.id))
  const removedItems = items.filter((item) => removed.has(item.id))
  const spawned = appendHasSpawns(
    survivors,
    removedItems,
    runtime.buckets.has,
    width,
    height,
    items,
  )

  return {
    items: spawned.items,
    changed: changed || spawned.changed,
  }
}

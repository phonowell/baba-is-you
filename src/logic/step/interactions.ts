import { resolveActiveEmptyProps } from '../empty.js'
import { keyFor } from '../helpers.js'
import {
  matchesRuleObjectWord,
  matchesRuleSubject,
  subjectRuleCandidates,
} from '../rule-match.js'

import {
  appendHasSpawns,
  buildGrid,
  hasLatchedFloat,
  hasProp,
  hasYouLikeProp,
  isYouLike,
  resolveLevelPropsGlobal,
  splitByFloatLayer,
} from './shared.js'

import { ruleDedupeKey } from '../rules.js'
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
  'boom',
  'defeat',
  'hot',
  'melt',
  'open',
  'shut',
  'sink',
  'weak',
])

// Official `bonus` pickup lives in the post-`make` you-sweep inside
// block(): a `you`/`you2`/`3d` unit collects same-layer `bonus` units on
// its cell. Modelled as its own stage so make/write products landing on
// a you are picked up in the same turn.
export const applyBonusPickup = (
  items: Item[],
  runtime: RuleRuntime,
): { items: Item[]; changed: boolean } => {
  const bonusRules = runtime.buckets.isProperty.filter(
    (rule) => rule.object === 'bonus' && !rule.objectNegated,
  )
  if (!bonusRules.length) return { items, changed: false }
  if (!items.some((item) => isYouLike(item))) return { items, changed: false }

  const { width } = runtime
  const byCell =
    runtime.context.items === items
      ? (runtime.context.byCell as Map<number, Item[]>)
      : buildGrid(items, width)

  const removed = new Set<number>()
  for (const you of items) {
    if (!isYouLike(you)) continue
    const cell = byCell.get(keyFor(you.x, you.y, width)) ?? []
    for (const item of cell) {
      // Official `findtype(b,x,y,0)` passes unitid 0 — no self-exclusion:
      // a `you`+`bonus` unit collects itself (floating(self,self) is true,
      // issafe fails) and is deleted in the same sweep.
      if (removed.has(item.id)) continue
      if (!hasProp(item, 'bonus')) continue
      if (hasLatchedFloat(item) !== hasLatchedFloat(you)) continue
      // Official `issafe(d)`: a `safe` bonus is never collected.
      if (hasProp(item, 'safe')) continue
      removed.add(item.id)
    }
  }
  if (!removed.size) return { items, changed: false }
  return {
    items: items.filter((item) => !removed.has(item.id)),
    changed: true,
  }
}

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

  // Official `handledels` applies each sweep immediately — later checks
  // only see survivors, so every presence/occupancy test filters out
  // units already marked removed.
  const live = (item: Item): boolean => !removed.has(item.id)

  // Pass order mirrors the official block() sweep sequence: sink → boom
  // → weak → melt → defeat → shut/open → eat (bonus sits in the
  // post-make you-sweep, modelled by a separate stage after `write`).
  if (presentProps.has('sink')) {
    for (const list of byCell.values()) {
      for (const layer of splitByFloatLayer(list)) {
        if (layer.length < 2) continue
        // Official sink: each sinker deletes its unsafe same-layer
        // cellmates, then dies itself only if something actually sank —
        // a lone sinker or a both-`safe` pairing leaves it in place.
        for (const sinker of layer) {
          if (!live(sinker) || !hasProp(sinker, 'sink')) continue
          const sinkerSafe = !removable(sinker)
          let sunk = false
          for (const other of layer) {
            if (other.id === sinker.id || !live(other)) continue
            const otherSafe = !removable(other)
            if (sinkerSafe && otherSafe) continue
            if (!otherSafe) markRemoved(other)
            if (!sinkerSafe) sunk = true
          }
          if (sunk) markRemoved(sinker)
        }
      }
    }
  }

  // `boom` detonates a (count-1)-cell square around each source: a
  // single `x is boom` rule only destroys the source's own cell;
  // stacked boom rules widen the blast. Sources already dead at the
  // sweep (e.g. sunk) never detonate, but a source killed mid-sweep by
  // another boom still fires — chain reactions propagate. `safe`
  // sources detonate and survive; `safe` victims are immune.
  if (presentProps.has('boom')) {
    const boomRules = runtime.buckets.isProperty.filter(
      (rule) => rule.object === 'boom' && !rule.objectNegated,
    )
    const sources = items.filter(
      (item) => hasProp(item, 'boom') && !removed.has(item.id),
    )
    for (const source of sources) {
      // Officially `count` is hasfeature_count — rule *instances*, so
      // duplicated `x is boom` formations each widen the blast.
      const count = boomRules
        .filter((rule) => matchesRuleSubject(source, rule, ruleContext))
        .reduce(
          (sum, rule) => sum + (runtime.ruleCounts.get(ruleDedupeKey(rule)) ?? 1),
          0,
        )
      const dim = count - 1
      const sourceFloat = hasLatchedFloat(source)
      for (let dy = -dim; dy <= dim; dy += 1) {
        for (let dx = -dim; dx <= dim; dx += 1) {
          const cell =
            byCell.get(keyFor(source.x + dx, source.y + dy, width)) ?? []
          for (const victim of cell) {
            if (victim.id === source.id || !live(victim)) continue
            if (hasLatchedFloat(victim) !== sourceFloat) continue
            if (hasProp(victim, 'safe')) continue
            markRemoved(victim)
          }
        }
      }
      if (removable(source)) markRemoved(source)
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
      const liveCount = () =>
        layer.reduce((n, item) => n + (live(item) ? 1 : 0), 0)

      // Official block() order: the `weak` sweep runs before melt/defeat
      // — a weak unit sharing a cell with anything on its float layer
      // shatters first, so e.g. a weak `defeat` skull breaks instead of
      // killing the `you` that stepped onto it. Units spawned this turn
      // (official `unit.new`) are exempt until the next turn.
      if (presentProps.has('weak') && liveCount() > 1) {
        for (const item of layer) {
          if (hasProp(item, 'weak') && !item.spawned) markRemoved(item)
        }
      }

      if (
        presentProps.has('hot') &&
        presentProps.has('melt') &&
        layer.some((item) => live(item) && hasProp(item, 'hot'))
      ) {
        for (const item of layer) {
          if (hasProp(item, 'melt')) markRemoved(item)
        }
      }

      if (
        presentProps.has('defeat') &&
        layer.some((item) => live(item) && hasProp(item, 'defeat'))
      ) {
        for (const item of layer) {
          if (isYouLike(item)) markRemoved(item)
        }
      }

      if (presentProps.has('open') && presentProps.has('shut')) {
        const openShutChanged = applyOpenShut(layer, removed, removable)
        if (openShutChanged) changed = true
      }

      if (eatRules.length) {
        for (const eater of layer) {
          if (removed.has(eater.id)) continue
          for (const rule of subjectRuleCandidates(eatRules, eater)) {
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
    // `floating_level`: the unit side is the latched `values[FLOAT]`; the
    // level pseudo-unit's float stays a fresh rule read.
    const floatOk = (item: Item): boolean =>
      hasLatchedFloat(item) === levelFloat
    const levelYou = hasYouLikeProp(levelProps)
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

import { keyForLayer } from '../helpers.js'
import { matchesRuleObjectWord } from '../rule-match.js'

import { hasLatchedFloat, isYouLike, resolveLevelPropsGlobal } from './shared.js'

import type { RuleRuntime } from '../rule-runtime.js'
import type { Item, Property } from '../types.js'

// `end`/`done` complete the level on contact like `win` — `end` is the
// official ending trigger and `done` marks a finished room.
const WIN_LIKE_PROPS = new Set<Property>(['win', 'end', 'done'])
const WIN_LIKE_PROPS_LIST = [...WIN_LIKE_PROPS]

const hasWinLike = (item: Item): boolean =>
  item.props.some((prop) => WIN_LIKE_PROPS.has(prop))

// Single pass: win iff some (cell, float-layer) holds both `you` and
// `win`. Layer keys mirror `splitByFloatLayer` without building cell
// lists; the EMPTY-subject half is per-cell (`resolveEmptyPropsByCell`):
// official empty pseudo-units win only when the SAME empty cell carries
// both `you` and a win prop — a union across cells would fuse conditions
// that hold in different places.
export const checkWin = (
  items: Item[],
  width: number,
  height: number,
  emptyPropsByCell: ReadonlyMap<number, ReadonlySet<string>>,
  runtime: RuleRuntime,
): boolean => {
  const youLayers = new Set<number>()
  const winLayers = new Set<number>()
  for (const item of items) {
    // The layer key is the latched `values[FLOAT]` (official `floating()`)
    // — a float rule formed this turn doesn't re-layer the win check.
    if (isYouLike(item))
      youLayers.add(keyForLayer(item.x, item.y, width, hasLatchedFloat(item)))
    if (hasWinLike(item))
      winLayers.add(keyForLayer(item.x, item.y, width, hasLatchedFloat(item)))
  }
  for (const key of youLayers) if (winLayers.has(key)) return true

  for (const props of emptyPropsByCell.values()) {
    const you = props.has('you') || props.has('you2') || props.has('3d')
    if (you) {
      for (const prop of WIN_LIKE_PROPS)
        if (props.has(prop)) return true
    }
  }
  const emptyHas = (prop: string): boolean => {
    for (const props of emptyPropsByCell.values())
      if (props.has(prop)) return true
    return false
  }

  const { level: levelRules } = runtime.buckets
  // No `level is …` rule means every level-prop check below short-circuits
  // on an empty set — skip the resolution outright.
  if (!levelRules.length) return false
  const { context } = runtime

  // `level is win/end/done`: the level entity itself is the goal — in the
  // official engine this wins outright the moment the rule holds, even on
  // the turn the last `you` died (JUST NO's `level is not not win` relies
  // on it: the push that completes the sentence is the move that kills).
  const levelProps = resolveLevelPropsGlobal(levelRules, context, width, height)
  if (WIN_LIKE_PROPS_LIST.some((prop) => levelProps.has(prop))) return true

  const levelFloat = levelProps.has('float')
  const levelYou =
    levelProps.has('you') || levelProps.has('you2') || levelProps.has('3d')
  const floatOk = (item: Item): boolean =>
    hasLatchedFloat(item) === levelFloat

  if (levelYou) {
    for (const rule of runtime.buckets.isProperty) {
      if (rule.objectNegated || rule.subjectNegated) continue
      if (!WIN_LIKE_PROPS.has(rule.object as Property)) continue
      if (rule.subject === 'empty') {
        if (emptyHas(rule.object)) return true
        continue
      }
      if (rule.subject === 'level') continue // covered above
      if (
        items.some(
          (item) =>
            floatOk(item) &&
            matchesRuleObjectWord(
              item,
              rule.subject,
              context.groupMembers,
            ),
        )
      )
        return true
    }
  }
  return false
}

export const hasAnyYou = (
  items: Item[],
  emptyPropsByCell: ReadonlyMap<number, ReadonlySet<string>>,
): boolean => {
  for (const item of items) if (isYouLike(item)) return true
  for (const props of emptyPropsByCell.values())
    if (props.has('you') || props.has('you2') || props.has('3d'))
      return true
  return false
}

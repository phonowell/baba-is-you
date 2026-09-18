import { resolveActiveEmptyProps } from './empty.js'
import { applyProperties } from './resolve.js'
import { collectRuleRuntime, createRuleRuntime } from './rule-runtime.js'
import { buildStepStages } from './step/phase-list.js'
import { checkWin, hasAnyYou } from './step/win.js'

import type { RuleRuntime } from './rule-runtime.js'
import type {
  StepPhaseItems,
  StepStage,
  StepStageSync,
} from './step/phase-list.js'
import type { Direction, GameState, Item, StepResult } from './types.js'

type StepFrame = {
  items: Item[]
  runtime: RuleRuntime
}

const itemSignature = (item: Item): string =>
  `${item.name}@${item.x},${item.y}${item.isText ? '!' : ''}${item.dir ?? ''}(${[...item.props].sort().join('+')})`

const sameItemFields = (a: Item, b: Item): boolean =>
  a === b ||
  (a.name === b.name &&
  a.x === b.x &&
  a.y === b.y &&
  a.isText === b.isText &&
  a.dir === b.dir &&
  (a.props === b.props ||
    (a.props.length === b.props.length &&
      a.props.every((prop, index) => prop === b.props[index]))))

const sameItems = (before: Item[], after: Item[]): boolean => {
  if (before === after) return true
  if (before.length !== after.length) return false

  // Order-identical fast path: stage pipelines keep survivors in place and
  // append spawns, so a net-unchanged step usually yields a field-equal
  // sequence — comparing fields avoids building any signature strings.
  let ordered = true
  for (let index = 0; index < before.length; index += 1) {
    const a = before[index]
    const b = after[index]
    if (!a || !b || !sameItemFields(a, b)) {
      ordered = false
      break
    }
  }
  if (ordered) return true

  const counts = new Map<string, number>()
  for (const item of before) {
    const key = itemSignature(item)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  for (const item of after) {
    const key = itemSignature(item)
    const left = (counts.get(key) ?? 0) - 1
    if (left < 0) return false
    counts.set(key, left)
  }
  return true
}

const resolveFrame = (
  items: StepPhaseItems,
  width: number,
  height: number,
): StepFrame => {
  const runtime = collectRuleRuntime(items, width, height)
  return {
    items: applyProperties(items, runtime),
    runtime,
  }
}

const rebindFrameWithSameRules = (
  items: Item[],
  runtime: RuleRuntime,
): StepFrame => {
  const reboundRuntime = createRuleRuntime(
    items,
    runtime.rules,
    runtime.width,
    runtime.height,
  )
  return {
    items,
    runtime: reboundRuntime,
  }
}

const refreshProperties = (
  items: StepPhaseItems,
  runtime: RuleRuntime,
): StepFrame => {
  const reboundRuntime = createRuleRuntime(
    items,
    runtime.rules,
    runtime.width,
    runtime.height,
  )
  return {
    items: applyProperties(items, reboundRuntime),
    runtime: reboundRuntime,
  }
}

const synchronizeStageFrame = (
  items: StepPhaseItems,
  runtime: RuleRuntime,
  sync: Exclude<StepStageSync, { kind: 'reuse-rules' }>,
): StepFrame => {
  if (sync.kind === 'recollect-rules')
    return resolveFrame(items, runtime.width, runtime.height)

  return refreshProperties(items, runtime)
}

const isReuseRulesStage = (
  stage: StepStage,
): stage is Extract<StepStage, { sync: { kind: 'reuse-rules' } }> =>
  stage.sync.kind === 'reuse-rules'

type StageOutcome = {
  frame: StepFrame
  changed: boolean
  rulesStale: boolean
}

const runStage = (
  frame: StepFrame,
  stage: StepStage,
  rulesStale: boolean,
): StageOutcome => {
  const keepFrame = (
    items: StepPhaseItems,
    recollectable: boolean,
  ): StageOutcome => {
    if (!rulesStale || !recollectable)
      return { frame, changed: false, rulesStale }
    return {
      frame: resolveFrame(items, frame.runtime.width, frame.runtime.height),
      changed: false,
      rulesStale: false,
    }
  }

  if (isReuseRulesStage(stage)) {
    const result = stage.run(frame.items, frame.runtime)
    if (!result.changed) return keepFrame(result.items, false)
    return {
      frame: rebindFrameWithSameRules(result.items, frame.runtime),
      changed: true,
      rulesStale: true,
    }
  }

  const result = stage.run(frame.items, frame.runtime)
  if (!result.changed)
    return keepFrame(result.items, stage.sync.kind === 'recollect-rules')
  return {
    frame: synchronizeStageFrame(result.items, frame.runtime, stage.sync),
    changed: true,
    rulesStale: stage.sync.kind !== 'recollect-rules',
  }
}

export const step = (
  state: GameState,
  direction: Direction | null,
): StepResult => {
  let frame = resolveFrame(state.items, state.width, state.height)
  let rulesStale = false

  // The produced frame's index is `state.turn + 1`; the predecessor seeds
  // tele RNG with its history length, which is the same value.
  const stages: StepStage[] = buildStepStages(direction, state.turn + 1)

  for (const stage of stages) {
    const stageResult = runStage(frame, stage, rulesStale)
    frame = stageResult.frame
    rulesStale = stageResult.rulesStale
  }

  // One empty-cells scan feeds both the win and the lose checks (the
  // resolver early-outs cheaply when no `empty is …` rules exist).
  const emptyProps = resolveActiveEmptyProps(
    frame.runtime.rules,
    frame.items,
    state.width,
    state.height,
  )
  const didWin = checkWin(frame.items, state.width, emptyProps)
  // Maps never lose: the overworld cursor is not a `you` entity, and the
  // predecessor has no lose state at all — without this, decorative rule
  // text like `BABA IS YOU` on a map would soft-lock navigation.
  const hasCursor = frame.items.some((item) => item.name === 'cursor')
  const didLose =
    !didWin && !hasCursor && !hasAnyYou(frame.items, emptyProps)

  const nextState: GameState = {
    ...state,
    items: frame.items,
    rules: frame.runtime.rules,
    status: didWin ? 'win' : didLose ? 'lose' : 'playing',
    turn: state.turn + 1,
  }

  const statusChanged =
    (state.status === 'win') !== didWin || (state.status === 'lose') !== didLose

  // changed follows net state, matching the predecessor engine: a step whose
  // stages mutated then restored the board (e.g. stepping onto a shift belt
  // that pushes straight back) must not count as a processed change — undo
  // depth, tele RNG seeding via turn, and render refresh all key off it.
  return { state: nextState, changed: !sameItems(state.items, frame.items) || statusChanged }
}

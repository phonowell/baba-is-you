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
  let changed = false

  const stages: StepStage[] = buildStepStages(direction, state.turn)

  for (const stage of stages) {
    const stageResult = runStage(frame, stage, rulesStale)
    frame = stageResult.frame
    rulesStale = stageResult.rulesStale
    if (stageResult.changed) changed = true
  }

  const didWin = checkWin(
    frame.items,
    state.width,
    frame.runtime.rules,
    state.height,
  )
  const didLose =
    !didWin &&
    !hasAnyYou(frame.items, frame.runtime.rules, state.width, state.height)

  const nextState: GameState = {
    ...state,
    items: frame.items,
    rules: frame.runtime.rules,
    status: didWin ? 'win' : didLose ? 'lose' : 'playing',
    turn: state.turn + 1,
  }

  const statusChanged =
    (state.status === 'win') !== didWin || (state.status === 'lose') !== didLose

  return { state: nextState, changed: changed || statusChanged }
}

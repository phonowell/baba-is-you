import { applyProperties } from './resolve.js'
import { collectRuleRuntime, createRuleRuntime } from './rule-runtime.js'
import { buildStepPhases, type StepPhase } from './step/phase-list.js'
import { checkWin, hasAnyYou } from './step/win.js'

import type { RuleRuntime } from './rule-runtime.js'
import type {
  Direction,
  GameState,
  Item,
  LevelItem,
  StepResult,
} from './types.js'

type PhaseItems = Item[] | LevelItem[]

const resolveFrame = (
  items: PhaseItems,
  width: number,
  height: number,
): { items: Item[]; runtime: RuleRuntime } => {
  const runtime = collectRuleRuntime(items, width, height)
  return {
    items: applyProperties(items, runtime),
    runtime,
  }
}

const rebindFrameWithSameRules = (
  items: Item[],
  runtime: RuleRuntime,
): { items: Item[]; runtime: RuleRuntime } => {
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

const refreshProps = (
  items: PhaseItems,
  runtime: RuleRuntime,
): { items: Item[]; runtime: RuleRuntime } => {
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

const runPhase = (
  frame: { items: Item[]; runtime: RuleRuntime },
  phase: StepPhase,
): { frame: { items: Item[]; runtime: RuleRuntime }; changed: boolean } => {
  const result = phase.run(frame.items, frame.runtime)

  if (phase.refresh === 'resolve') {
    return {
      frame: resolveFrame(
        result.items,
        frame.runtime.width,
        frame.runtime.height,
      ),
      changed: result.changed,
    }
  }

  if (phase.refresh === 'props') {
    return {
      frame: refreshProps(result.items, frame.runtime),
      changed: result.changed,
    }
  }

  return {
    frame: rebindFrameWithSameRules(result.items as Item[], frame.runtime),
    changed: result.changed,
  }
}

export const step = (
  state: GameState,
  direction: Direction | null,
): StepResult => {
  let frame = resolveFrame(state.items, state.width, state.height)
  let changed = false

  const phases: StepPhase[] = buildStepPhases(direction, state.turn)

  for (const phase of phases) {
    const phaseResult = runPhase(frame, phase)
    frame = phaseResult.frame
    if (phaseResult.changed) changed = true
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

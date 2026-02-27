import { applyProperties, applyTransforms } from './resolve.js'
import { collectRuleRuntime, createRuleRuntime } from './rule-runtime.js'
import { applyInteractions } from './step/interactions.js'
import { applyMake } from './step/make.js'
import { moveItems } from './step/move-single.js'
import {
  applyDirectionalFacing,
  applyFall,
  applyMore,
  applyMoveAdjective,
  applyShift,
} from './step/phases.js'
import { hasProp } from './step/shared.js'
import { applyTeleport } from './step/teleport.js'
import { checkWin, hasAnyYou } from './step/win.js'
import { applyWrite } from './step/write.js'

import type { RuleRuntime } from './rule-runtime.js'
import type {
  Direction,
  GameState,
  Item,
  LevelItem,
  StepResult,
} from './types.js'

type RefreshMode = 'none' | 'props' | 'resolve'
type PhaseItems = Item[] | LevelItem[]

type StepPhase = {
  refresh: RefreshMode
  run: (
    items: Item[],
    runtime: RuleRuntime,
  ) => { items: PhaseItems; changed: boolean }
}

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

  const phases: StepPhase[] = [
    {
      refresh: 'props',
      run: (items, runtime) => {
        if (!direction) return { items, changed: false }
        const moved = moveItems(
          items,
          direction,
          runtime,
          (item) => hasProp(item, 'you') && !hasProp(item, 'sleep'),
          false,
        )
        return { items: moved.items, changed: moved.moved }
      },
    },
    {
      refresh: 'none',
      run: (items, runtime) => {
        const moved = applyMoveAdjective(items, runtime)
        return { items: moved.items, changed: moved.moved }
      },
    },
    {
      refresh: 'props',
      run: (items, runtime) => {
        const moved = applyFall(
          items,
          runtime.width,
          runtime.height,
          runtime.rules,
        )
        return { items: moved.items, changed: moved.moved }
      },
    },
    {
      refresh: 'resolve',
      run: (items, runtime) => {
        const moved = applyShift(items, runtime)
        return { items: moved.items, changed: moved.moved }
      },
    },
    {
      refresh: 'none',
      run: (items) => {
        const rotated = applyDirectionalFacing(items)
        return { items: rotated.items, changed: rotated.changed }
      },
    },
    {
      refresh: 'resolve',
      run: (items, runtime) => {
        const transformed = applyTransforms(items, runtime)
        return { items: transformed.items, changed: transformed.changed }
      },
    },
    {
      refresh: 'resolve',
      run: (items, runtime) => applyMake(items, runtime),
    },
    {
      refresh: 'resolve',
      run: (items, runtime) => applyWrite(items, runtime),
    },
    {
      refresh: 'resolve',
      run: (items, runtime) => applyMore(items, runtime.width, runtime.height),
    },
    {
      refresh: 'resolve',
      run: (items, runtime) => applyInteractions(items, runtime),
    },
    {
      refresh: 'resolve',
      run: (items, runtime) => {
        const teleported = applyTeleport(items, runtime.width, state.turn)
        return { items: teleported.items, changed: teleported.moved }
      },
    },
  ]

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

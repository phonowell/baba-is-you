import { applyProperties, applyTransforms } from './resolve.js'
import { collectRules } from './rules.js'
import { applyInteractions } from './step/interactions.js'
import { moveItems } from './step/move-single.js'
import {
  applyDirectionalFacing,
  applyMoveAdjective,
  applyShift,
} from './step/phases.js'
import { hasProp } from './step/shared.js'
import { applyTeleport } from './step/teleport.js'
import { checkWin, hasAnyYou } from './step/win.js'

import type { Direction, GameState, StepResult } from './types.js'

export const step = (state: GameState, direction: Direction): StepResult => {
  const baseRules = collectRules(state.items, state.width, state.height)
  const baseItems = applyProperties(state.items, baseRules)

  const playerMoveResult = moveItems(
    baseItems,
    direction,
    state.width,
    state.height,
    baseRules,
    (item) => hasProp(item, 'you'),
    false,
  )
  const playerMoveWithProps = applyProperties(playerMoveResult.items, baseRules)
  const moveAdjectiveResult = applyMoveAdjective(
    playerMoveWithProps,
    state.width,
    state.height,
    baseRules,
  )
  const moveAdjectiveWithProps = applyProperties(
    moveAdjectiveResult.items,
    baseRules,
  )
  const shiftResult = applyShift(
    moveAdjectiveWithProps,
    state.width,
    state.height,
    baseRules,
  )

  const postMoveRules = collectRules(
    shiftResult.items,
    state.width,
    state.height,
  )
  const postMoveWithProps = applyProperties(shiftResult.items, postMoveRules)
  const rotatedResult = applyDirectionalFacing(postMoveWithProps)
  const transformResult = applyTransforms(
    rotatedResult.items,
    postMoveRules,
    state.width,
    state.height,
  )

  const preInteractionWithProps = applyProperties(
    transformResult.items,
    postMoveRules,
  )
  const interactionResult = applyInteractions(
    preInteractionWithProps,
    state.width,
    postMoveRules,
  )

  const postInteractionWithProps = applyProperties(
    interactionResult.items,
    postMoveRules,
  )
  const teleportResult = applyTeleport(
    postInteractionWithProps,
    state.width,
    state.turn,
  )

  const didWin = checkWin(teleportResult.items, state.width)
  const didLose = !didWin && !hasAnyYou(teleportResult.items)

  const finalRules = collectRules(
    teleportResult.items,
    state.width,
    state.height,
  )
  const finalItems = applyProperties(teleportResult.items, finalRules)

  const nextState: GameState = {
    ...state,
    items: finalItems,
    rules: finalRules,
    status: didWin ? 'win' : didLose ? 'lose' : 'playing',
    turn: state.turn + 1,
  }

  const statusChanged =
    (state.status === 'win') !== didWin || (state.status === 'lose') !== didLose
  const changed =
    playerMoveResult.moved ||
    moveAdjectiveResult.moved ||
    shiftResult.moved ||
    rotatedResult.changed ||
    transformResult.changed ||
    interactionResult.changed ||
    teleportResult.moved ||
    statusChanged

  return { state: nextState, changed }
}

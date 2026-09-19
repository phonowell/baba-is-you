import assert from 'node:assert/strict'
import test from 'node:test'

import { createInitialState } from './state.js'
import { step } from './step.js'
import { buildStepStages } from './step/phase-list.js'

import type { Direction, GameState, LevelData, LevelItem } from './types.js'

const createItem = (
  id: number,
  name: string,
  x: number,
  y: number,
  isText: boolean,
): LevelItem => ({ id, name, x, y, isText })

const stripRuleSource = (state: GameState): GameState => {
  const rest = { ...state }
  delete rest.rulesSourceItems
  return rest
}

test('buildStepStages exposes gameplay-first stage names and sync semantics', () => {
  const stages = buildStepStages('right', 0)

  assert.deepEqual(
    stages.map((stage) => stage.name),
    [
      'player-move',
      'auto-move',
      'gravity',
      'shift',
      'direction-faces',
      'transform',
      'make',
      'write',
      'more',
      'back',
      'interactions',
      'teleport',
    ],
  )

  assert.deepEqual(
    stages.map((stage) => stage.sync.kind),
    [
      'reapply-properties',
      'reuse-rules',
      'reapply-properties',
      'recollect-rules',
      'reuse-rules',
      'recollect-rules',
      'recollect-rules',
      'recollect-rules',
      'recollect-rules',
      'reuse-rules',
      'recollect-rules',
      'recollect-rules',
    ],
  )
})

test('step rule-source reuse stays transparent across unit-only turns', () => {
  // The cached `rules`/`overriddenTextIds` must never change outcomes: run
  // the same walk twice, once letting `rulesSourceItems` ride forward and
  // once stripping it so every step re-parses from scratch.
  const level: LevelData = {
    title: 'rule-source-transparency',
    width: 6,
    height: 4,
    items: [
      createItem(1, 'baba', 1, 1, false),
      createItem(2, 'wall', 4, 1, false),
      createItem(3, 'baba', 0, 3, true),
      createItem(4, 'is', 1, 3, true),
      createItem(5, 'you', 2, 3, true),
      createItem(6, 'wall', 3, 0, true),
      createItem(7, 'is', 4, 0, true),
      createItem(8, 'stop', 5, 0, true),
    ],
  }

  const directions: (Direction | null)[] = [
    'right',
    'down',
    null,
    'left',
    'right',
    null,
    'up',
    'right',
    'down',
    'left',
  ]

  let cached = createInitialState(level, 0)
  let fresh = stripRuleSource(createInitialState(level, 0))
  for (const direction of directions) {
    cached = step(cached, direction).state
    fresh = stripRuleSource(step(fresh, direction).state)
    assert.deepEqual(
      stripRuleSource(cached),
      fresh,
      `turn diverged on direction ${direction}`,
    )
    // The reuse path must actually be exercised — a fully collecting
    // pipeline would make this test vacuous.
    assert.ok(cached.rulesSourceItems !== undefined)
  }
})

test('step re-collects rules when pushed text breaks a phrase', () => {
  // Pushing the `stop` card out of the `wall is stop` column changes the
  // parser-visible layout — the same step must drop `stop` from walls.
  const level: LevelData = {
    title: 'rule-source-invalidation',
    width: 6,
    height: 4,
    items: [
      createItem(1, 'baba', 5, 2, false),
      createItem(2, 'wall', 0, 3, false),
      createItem(3, 'baba', 0, 0, true),
      createItem(4, 'is', 1, 0, true),
      createItem(5, 'you', 2, 0, true),
      createItem(6, 'wall', 4, 0, true),
      createItem(7, 'is', 4, 1, true),
      createItem(8, 'stop', 4, 2, true),
    ],
  }

  const initial = createInitialState(level, 0)
  const wallBefore = initial.items.find(
    (item) => item.name === 'wall' && !item.isText,
  )
  assert.equal(wallBefore?.props.includes('stop'), true)

  const moved = step(initial, 'left').state
  const wall = moved.items.find((item) => item.name === 'wall' && !item.isText)
  assert.equal(wall?.props.includes('stop'), false)
  assert.equal(
    moved.rules.some(
      (rule) =>
        rule.kind === 'is-property' &&
        rule.subject === 'wall' &&
        rule.object === 'stop' &&
        !rule.objectNegated,
    ),
    false,
  )
  const baba = moved.items.find((item) => item.name === 'baba' && !item.isText)
  assert.equal(baba?.x, 4)
})

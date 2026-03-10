import assert from 'node:assert/strict'
import test from 'node:test'

import { buildStepStages } from './step/phase-list.js'

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
      'recollect-rules',
      'recollect-rules',
    ],
  )
})

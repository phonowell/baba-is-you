import assert from 'node:assert/strict'
import test from 'node:test'

import { parseLevel } from '../logic/parse-level.js'
import { bindGoldensToLevels } from './app-golden-binding.js'

import type { LevelData } from '../logic/types.js'

const level = (title: string, body: string): LevelData =>
  parseLevel(`title ${title}; size 4x3; ${body}`)

type TestGolden = {
  name: string
  level: LevelData
}

const golden = (name: string, level: LevelData): TestGolden => ({
  name,
  level,
})

const campaign = [
  level('ONE', 'Baba 0,0; Is 1,0; You 2,0; baba 0,1'),
  level('TWO', 'Rock 0,0; Is 1,0; You 2,0; rock 0,1'),
  // Title twins: punctuation is stripped for matching, so both normalize
  // to the same key and only the layout can tell them apart.
  level('BRIDGE?', 'Baba 0,0; Is 1,0; You 2,0; baba 0,1; flag 0,2'),
  level('BRIDGE', 'Baba 0,0; Is 1,0; You 2,0; baba 0,1; rock 0,2'),
]

test('binding matches a golden to the campaign level by normalized title and size', () => {
  // The recorded fixture drops the '?' the campaign title carries —
  // matching must still find the level.
  const recording = golden('g/0-0', level('TWO!', 'Rock 0,0; Is 1,0; You 2,0; rock 0,1; Wall 3,3'))
  const binding = bindGoldensToLevels([recording], campaign)

  assert.equal(binding.forLevelIndex(1), recording)
  assert.equal(binding.forLevelIndex(0), undefined)
  assert.equal(binding.forLevelIndex(2), undefined)
})

test('binding uses the layout signature to break a title tie', () => {
  // 'BRIDGE' recorded under its twin's exact title: title hits are
  // ambiguous, the item set points at level 3 alone.
  const recording = golden('g/2-0', level('BRIDGE?', 'Baba 0,0; Is 1,0; You 2,0; baba 0,1; rock 0,2'))
  const binding = bindGoldensToLevels([recording], campaign)

  assert.equal(binding.forLevelIndex(3), recording)
  assert.equal(binding.forLevelIndex(2), undefined)
})

test('binding falls back to the layout signature when the title changed entirely', () => {
  const recording = golden('g/3-0', level('RENAMED', 'Baba 0,0; Is 1,0; You 2,0; baba 0,1; flag 0,2'))
  const binding = bindGoldensToLevels([recording], campaign)

  assert.equal(binding.forLevelIndex(2), recording)
})

test('binding leaves a title tie unresolved when the layout matches neither twin', () => {
  const recording = golden('g/4-0', level('BRIDGE', 'Baba 0,0; Is 1,0; You 2,0; baba 0,1; text 0,2'))
  const binding = bindGoldensToLevels([recording], campaign)

  assert.equal(binding.forLevelIndex(2), undefined)
  assert.equal(binding.forLevelIndex(3), undefined)
})

test('a level with several recordings keeps the first golden', () => {
  const first = golden('g/0-0', level('ONE', 'Baba 0,0; Is 1,0; You 2,0; baba 0,1'))
  const second = golden('g/0-1', level('ONE', 'Baba 0,0; Is 1,0; You 2,0; baba 0,1'))
  const binding = bindGoldensToLevels([first, second], campaign)

  assert.equal(binding.forLevelIndex(0), first)
})

test('a golden carrying levelIndex wins its slot over an inferred binding', () => {
  // The inferred binding lands first (unique title 'ONE'); the solver-
  // emitted pin then claims index 0 outright.
  const inferred = golden('g/0-0', level('ONE', 'Baba 0,0; Is 1,0; You 2,0; baba 0,1'))
  const pinned = {
    ...golden('g/9-9', level('ZERO', 'keke 0,0')),
    levelIndex: 0,
  }
  const binding = bindGoldensToLevels([inferred, pinned], campaign)

  assert.equal(binding.forLevelIndex(0), pinned)
})

test('forLevel resolves a recorded layout by identity or signature', () => {
  const recordedLevel = level('ONE', 'Baba 0,0; Is 1,0; You 2,0; baba 0,1')
  const recording = golden('g/0-0', recordedLevel)
  const binding = bindGoldensToLevels([recording], campaign)

  // The store keeps the golden's own LevelData as customLevel during
  // playback — the same object resolves without any signature work.
  assert.equal(binding.forLevel(recordedLevel), recording)
  // A re-parsed copy of the same board still resolves through the
  // layout signature.
  assert.equal(
    binding.forLevel(level('ONE', 'Baba 0,0; Is 1,0; You 2,0; baba 0,1')),
    recording,
  )
  assert.equal(binding.forLevel(level('OTHER', 'Baba 1,1')), undefined)
})

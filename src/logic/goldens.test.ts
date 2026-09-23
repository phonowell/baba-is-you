import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import test from 'node:test'

import { levels } from '../levels.js'
import { layoutSignature } from './helpers.js'
import { parseLevel } from './parse-level.js'
import { replayLevel } from './replay.js'

import type { LevelData } from './types.js'

// Golden replays recorded from the predecessor project's winning sessions
// (`scripts/port-rust-goldens.ts`). Each file pins the full per-input state
// trajectory of a real playthrough; any engine regression that alters a
// step's outcome shows up here as the first diverging snapshot.

const GOLDENS_DIR = new URL('../../goldens/', import.meta.url).pathname

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry)
    return statSync(path).isDirectory() ? walk(path) : [path]
  })

type Golden = {
  level: string
  levelIndex?: number
  levelData?: LevelData
  inputs: string
  initial: string
  hashes: string[]
  final: string
  status: string
}

const goldenFiles = walk(GOLDENS_DIR).filter((path) =>
  path.endsWith('.json'),
)

assert.ok(goldenFiles.length > 0, 'expected at least one recorded golden')

for (const path of goldenFiles) {
  const name = relative(GOLDENS_DIR, path).replace(/\.json$/, '')
  test(`golden replay ${name}`, () => {
    const golden = JSON.parse(readFileSync(path, 'utf8')) as Golden
    // When the recording predates a level-file edit, the golden embeds the
    // layout it was actually recorded against (`levelData`).
    const level =
      golden.levelData ??
      parseLevel(readFileSync(join(GOLDENS_DIR, '..', golden.level), 'utf8'))

    // Consistency: an embedded layout must still match its real source —
    // the campaign level at `levelIndex` or the level file at `level` —
    // otherwise the golden silently replays a stale board.
    if (golden.levelIndex !== undefined) {
      const source = levels[golden.levelIndex]
      assert.ok(source, `levelIndex ${golden.levelIndex} out of range`)
      assert.equal(
        layoutSignature(level),
        layoutSignature(parseLevel(source)),
        'embedded levelData diverged from the campaign level',
      )
    } else if (golden.levelData && golden.level) {
      assert.equal(
        layoutSignature(level),
        layoutSignature(
          parseLevel(
            readFileSync(join(GOLDENS_DIR, '..', golden.level), 'utf8'),
          ),
        ),
        'embedded levelData diverged from its level file',
      )
    }

    const result = replayLevel(level, golden.inputs)

    assert.equal(result.initial, golden.initial, 'initial state diverged')
    const n = Math.min(result.hashes.length, golden.hashes.length)
    for (let i = 0; i < n; i += 1) {
      if (result.hashes[i] !== golden.hashes[i]) {
        assert.fail(
          `step ${i + 1} (input '${golden.inputs[i]}') diverged\n` +
            `expected hash: ${golden.hashes[i]}\n` +
            `actual state:  ${result.snapshots[i]}\n` +
            `level: ${golden.level}, inputs up to step: ${golden.inputs.slice(0, i + 1)}`,
        )
      }
    }
    assert.equal(
      result.hashes.length,
      golden.hashes.length,
      'snapshot count diverged',
    )
    assert.equal(
      result.snapshots[result.snapshots.length - 1],
      golden.final,
      'final state diverged',
    )
    assert.equal(result.finalStatus, golden.status)
    assert.equal(golden.status, 'win', 'golden should record a winning run')
  })
}

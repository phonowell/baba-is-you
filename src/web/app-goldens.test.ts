import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { parseLevel } from '../logic/parse-level.js'
import { createGoldenStore } from './app-goldens.js'

import type { GoldenManifestEntry } from './app-goldens.js'
import type { LevelData } from '../logic/types.js'

const level = (title: string, body: string): LevelData =>
  parseLevel(`title ${title}; size 4x3; ${body}`)

const LEVEL_TEXT_ONE = 'title ONE; size 4x3; Baba 0,0; Is 1,0; You 2,0; baba 0,1;'

const manifest: GoldenManifestEntry[] = [
  {
    name: 'g/0-0',
    inputs: 'rrdd',
    levelSource: 'levels/x/one.txt',
    levelText: LEVEL_TEXT_ONE,
  },
  {
    name: 'g/1-0',
    inputs: 'll',
    levelSource: 'levels/x/two.txt',
    levelIndex: 1,
    levelData: level('TWO', 'Rock 0,0; Is 1,0; You 2,0; rock 0,1'),
  },
  // Build-stripped shape: no embedded snapshot, only the campaign index.
  {
    name: 'g/2-0',
    inputs: 'ud',
    levelSource: 'levels/x/three.txt',
    levelIndex: 2,
  },
]

const campaignLevels: LevelData[] = [
  level('C0', 'baba 0,0'),
  level('C1', 'keke 0,0'),
  level('THREE', 'Baba 0,0; Is 1,0; You 2,0; keke 0,1'),
]

const makeReader = () => {
  let calls = 0
  const read = (name: string): Promise<string> => {
    calls += 1
    assert.equal(name, 'goldens.json')
    return Promise.resolve(JSON.stringify(manifest))
  }
  return { read, calls: () => calls }
}

describe('createGoldenStore', () => {
  it('answers menu lookups from the eager index without touching the payload', () => {
    const reader = makeReader()
    const store = createGoldenStore(reader.read, { '0': 'g/0-0' })

    assert.equal(store.nameForLevelIndex(0), 'g/0-0')
    assert.equal(store.nameForLevelIndex(7), undefined)
    assert.equal(reader.calls(), 0)
  })

  it('decodes the payload once and resolves only the requested golden', async () => {
    const reader = makeReader()
    const store = createGoldenStore(reader.read, {})

    const golden = await store.loadByName('g/0-0')
    assert.equal(golden?.name, 'g/0-0')
    assert.equal(golden?.inputs, 'rrdd')
    assert.equal(golden?.level.title, 'ONE')
    assert.equal(golden?.level.width, 4)
    assert.equal(reader.calls(), 1)

    // Second load hits the name cache — the manifest is not re-read and
    // the level is not re-parsed (same object back).
    assert.equal(await store.loadByName('g/0-0'), golden)
    assert.equal(reader.calls(), 1)
  })

  it('prefers pinned levelIndex data and returns undefined for unknown names', async () => {
    const store = createGoldenStore(makeReader().read, {})

    const golden = await store.loadByName('g/1-0')
    assert.equal(golden?.levelIndex, 1)
    assert.equal(golden?.level.title, 'TWO')
    assert.equal(await store.loadByName('g/missing'), undefined)
  })

  it('resolves build-stripped entries from the campaign level index', async () => {
    const store = createGoldenStore(makeReader().read, {}, campaignLevels)

    const golden = await store.loadByName('g/2-0')
    // The campaign level object itself — not a re-parse — so a replay's
    // board identity-matches the level the menu opened.
    assert.equal(golden?.level, campaignLevels[2])
    assert.equal(golden?.levelIndex, 2)
    assert.equal(golden?.inputs, 'ud')
  })

  it('rejects a stripped entry whose levelIndex has no campaign level', async () => {
    const outOfRange: GoldenManifestEntry[] = [
      { name: 'g/z', inputs: 'rr', levelSource: 'levels/x/z.txt', levelIndex: 9 },
    ]
    const store = createGoldenStore(
      () => Promise.resolve(JSON.stringify(outOfRange)),
      {},
      campaignLevels,
    )
    assert.equal(await store.loadByName('g/z'), undefined)
    // Without campaign levels the same shape is degenerate too.
    const bare = createGoldenStore(
      () => Promise.resolve(JSON.stringify(outOfRange)),
      {},
    )
    assert.equal(await bare.loadByName('g/z'), undefined)
  })

  it('rejects goldens whose recorded layout is degenerate', async () => {
    const broken: GoldenManifestEntry[] = [
      { name: 'g/x', inputs: '', levelSource: 'levels/x/none.txt' },
    ]
    const store = createGoldenStore(
      () => Promise.resolve(JSON.stringify(broken)),
      {},
    )
    assert.equal(await store.loadByName('g/x'), undefined)
  })

  it('loadedForLevel matches by identity first and signature for re-parsed copies', async () => {
    const store = createGoldenStore(makeReader().read, {})

    const foreign = level('ONE', 'Baba 0,0; Is 1,0; You 2,0; baba 0,1')
    assert.equal(store.loadedForLevel(foreign), undefined)

    const golden = await store.loadByName('g/0-0')
    assert.ok(golden)
    assert.equal(store.loadedForLevel(golden.level), golden)
    // A re-parsed copy of the same board resolves through the signature.
    assert.equal(store.loadedForLevel(foreign), golden)
    assert.equal(
      store.loadedForLevel(level('OTHER', 'keke 1,1')),
      undefined,
    )
  })
})

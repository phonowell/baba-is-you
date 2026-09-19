import assert from 'node:assert/strict'
import test from 'node:test'

import { parseAsciiLevel } from './parse-ascii-level.js'

import type { LevelItem } from './types.js'

const cellsOf = (
  items: LevelItem[],
): Map<
  string,
  Array<Pick<LevelItem, 'name' | 'isText'> & Partial<LevelItem>>
> => {
  const cells = new Map<
    string,
    Array<Pick<LevelItem, 'name' | 'isText'> & Partial<LevelItem>>
  >()
  for (const item of items) {
    const key = `${item.x},${item.y}`
    const list = cells.get(key) ?? []
    list.push({
      name: item.name,
      isText: item.isText,
    })
    cells.set(key, list)
  }
  return cells
}

test('parses legend objects and uppercase text glyphs', () => {
  const level = parseAsciiLevel(
    `b = baba
f = flag
---
b B f F
`,
  )

  assert.equal(level.width, 7)
  assert.equal(level.height, 1)
  const cells = cellsOf(level.items)
  assert.deepEqual(cells.get('0,0'), [{ name: 'baba', isText: false }])
  assert.deepEqual(cells.get('2,0'), [{ name: 'baba', isText: true }])
  assert.deepEqual(cells.get('4,0'), [{ name: 'flag', isText: false }])
  assert.deepEqual(cells.get('6,0'), [{ name: 'flag', isText: true }])
})

test('parses operator and property glyphs as text', () => {
  const level = parseAsciiLevel(
    `b = baba
f = flag
---
B=✥ F=✓
b ↦ w
`,
  )
  const cells = cellsOf(level.items)
  assert.deepEqual(cells.get('0,0'), [{ name: 'baba', isText: true }])
  assert.deepEqual(cells.get('1,0'), [{ name: 'is', isText: true }])
  assert.deepEqual(cells.get('2,0'), [{ name: 'you', isText: true }])
  assert.deepEqual(cells.get('6,0'), [{ name: 'win', isText: true }])
  assert.deepEqual(cells.get('2,1'), [{ name: 'push', isText: true }])
})

test('stacks legend cells bottom-to-top via `on`', () => {
  const level = parseAsciiLevel(
    `o = "win" on water
w = water
---
o w
`,
  )
  const cells = cellsOf(level.items)
  assert.deepEqual(cells.get('0,0'), [
    { name: 'water', isText: false },
    { name: 'win', isText: true },
  ])
  assert.deepEqual(cells.get('2,0'), [{ name: 'water', isText: false }])
})

test('applies legend direction suffix', () => {
  const level = parseAsciiLevel(
    `r = rocket up
---
r r
`,
  )
  const rocket = level.items.find((item) => item.name === 'rocket')
  assert.equal(rocket?.dir, 'up')
})

test('merges --- separated layers into shared cells', () => {
  const level = parseAsciiLevel(
    `b = baba
t = tile
---
b t
---
t B
`,
  )
  const cells = cellsOf(level.items)
  assert.deepEqual(cells.get('0,0'), [
    { name: 'baba', isText: false },
    { name: 'tile', isText: false },
  ])
  assert.deepEqual(cells.get('2,0'), [
    { name: 'tile', isText: false },
    { name: 'baba', isText: true },
  ])
})

test('honors right pad and title metadata', () => {
  const level = parseAsciiLevel(
    `title = Custom Pond
right pad = 4
b = baba
---
bb
`,
    'ignored-name.txt',
  )
  assert.equal(level.title, 'Custom Pond')
  assert.equal(level.width, 6)
})

test('derives title from source filename', () => {
  const level = parseAsciiLevel(`b = baba\n---\nb\n`, '12-crab-storage.txt')
  assert.equal(level.title, 'CRAB STORAGE')
})

test('rejects map legend entries', () => {
  assert.throws(
    () => parseAsciiLevel(`l = map 1 lake\n---\nl\n`, 'index.txt'),
    /Unsupported legend entry 'l = map 1 lake'/,
  )
})

test('parses palette, background and color override metadata', () => {
  const level = parseAsciiLevel(
    `w = wall
r = rocket up
palette = ocean
background = island island_decor
+ w,r = 3,2
+ "w" = 1,2 1,4
+ "r" = 2,0,2,1
---
wr
`,
    '5-brick-wall.txt',
  )
  assert.equal(level.meta?.palette, 'ocean')
  assert.deepEqual(level.meta?.backgrounds, ['island', 'island_decor'])
  assert.deepEqual(level.meta?.colorOverrides, {
    wall: [3, 2],
    rocket: [3, 2],
  })
  assert.deepEqual(level.meta?.textColorOverrides, {
    wall: [
      [1, 2],
      [1, 4],
    ],
    rocket: [
      [2, 0],
      [2, 1],
    ],
  })
})

test('parses a real predecessor level file', () => {
  const level = parseAsciiLevel(
    `f = flag
i = ice
j = jelly
w = wall
b = baba
palette = ocean
---
F=✓iii
w b w
B=✥&≉w
W=⊘
`,
    '1-icy-waters.txt',
  )
  assert.equal(level.title, 'ICY WATERS')
  assert.equal(level.width, 6)
  assert.equal(level.height, 4)
  const cells = cellsOf(level.items)
  assert.deepEqual(cells.get('0,0'), [{ name: 'flag', isText: true }])
  assert.deepEqual(cells.get('2,0'), [{ name: 'win', isText: true }])
  assert.deepEqual(cells.get('2,1'), [{ name: 'baba', isText: false }])
  assert.deepEqual(cells.get('2,2'), [{ name: 'you', isText: true }])
  assert.deepEqual(cells.get('3,2'), [{ name: 'and', isText: true }])
  assert.deepEqual(cells.get('4,2'), [{ name: 'sink', isText: true }])
  assert.deepEqual(cells.get('0,3'), [{ name: 'wall', isText: true }])
  assert.deepEqual(cells.get('2,3'), [{ name: 'stop', isText: true }])
})

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
      ...(item.levelTarget ? { levelTarget: item.levelTarget } : {}),
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

test('applies legend direction suffix and dot line glyph', () => {
  const level = parseAsciiLevel(
    `r = rocket up
---
r.r
`,
  )
  const rocket = level.items.find((item) => item.name === 'rocket')
  assert.equal(rocket?.dir, 'up')
  const line = level.items.find((item) => item.name === 'line')
  assert.deepEqual(
    line && { x: line.x, y: line.y, isText: line.isText },
    { x: 1, y: 0, isText: false },
  )
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

test('parses level-icon glyphs into level entities with targets', () => {
  const level = parseAsciiLevel(`---\n1𝟎𝟙𝔸•\n`, 'index.txt')
  const targets = level.items.map((item) => item.levelTarget)
  assert.deepEqual(targets, [
    { kind: 'number', n: 1 },
    { kind: 'number', n: 10 },
    { kind: 'extra', n: 1 },
    { kind: 'letter', c: 'a' },
    { kind: 'parent' },
  ])
  assert.ok(level.items.every((item) => item.name === 'level' && !item.isText))
})

test('parses map legend entries into subworld level icons', () => {
  const level = parseAsciiLevel(`l = map 1 lake\n---\nl.L\n`, 'index.txt')
  const cells = cellsOf(level.items)
  assert.deepEqual(cells.get('0,0'), [
    {
      name: 'level',
      isText: false,
      levelTarget: { kind: 'subworld', n: 1, icon: 'lake' },
    },
  ])
  assert.deepEqual(cells.get('1,0'), [{ name: 'line', isText: false }])
  // uppercase glyph of a level icon produces `level` text (matches the
  // predecessor's Text::Object(Noun::Level))
  assert.deepEqual(cells.get('2,0'), [{ name: 'level', isText: true }])
})

test('parses palette, background and color override metadata', () => {
  const level = parseAsciiLevel(
    `w = wall
r = rocket up
palette = ocean
background = island island_decor
+ w,r = 3,2
+ "w" = 1,2,1,4
---
wr
`,
    'index.txt',
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

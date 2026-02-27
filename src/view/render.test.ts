import assert from 'node:assert/strict'
import test from 'node:test'

import { ANSI_IS, ANSI_TEXT } from './render-config.js'
import { render } from './render.js'

import type { GameState } from '../logic/types.js'

const stripAnsi = (value: string): string =>
  value.replace(/\x1b\[[0-9;]*m/g, '')

const graphemes = (value: string): string[] =>
  Array.from(
    new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(value),
    ({ segment }) => segment,
  )

const measureWidth = (value: string): number =>
  graphemes(stripAnsi(value)).reduce(
    (total, segment) =>
      total + (/\p{Extended_Pictographic}/u.test(segment) ? 2 : segment.length),
    0,
  )

test('render keeps each grid row at width*2 even with emoji glyphs', () => {
  const state: GameState = {
    levelIndex: 0,
    title: 'row-width',
    width: 2,
    height: 1,
    items: [{ id: 1, name: 'star', x: 0, y: 0, isText: false, props: [] }],
    rules: [],
    status: 'playing',
    turn: 0,
  }

  const lines = render(state).split('\n')
  const row = lines[3] ?? ''

  assert.equal(measureWidth(row), state.width * 2)
})

test('render shows directional arrows for belt by dir', () => {
  const state: GameState = {
    levelIndex: 0,
    title: 'belt-arrows',
    width: 4,
    height: 1,
    items: [
      { id: 1, name: 'belt', x: 0, y: 0, isText: false, props: [], dir: 'up' },
      { id: 2, name: 'belt', x: 1, y: 0, isText: false, props: [], dir: 'right' },
      { id: 3, name: 'belt', x: 2, y: 0, isText: false, props: [], dir: 'down' },
      { id: 4, name: 'belt', x: 3, y: 0, isText: false, props: [], dir: 'left' },
    ],
    rules: [],
    status: 'playing',
    turn: 0,
  }

  const lines = render(state).split('\n')
  const row = lines[3] ?? ''

  assert.equal(row.replace(/\s/g, ''), '⬆️➡️⬇️⬅️')
})

test('render shows defeat hint when status is lose', () => {
  const state: GameState = {
    levelIndex: 0,
    title: 'lose-status',
    width: 1,
    height: 1,
    items: [],
    rules: [],
    status: 'lose',
    turn: 0,
  }

  const output = render(state)
  assert.match(output, /DEFEAT! Press R to restart, Q to menu\./)
})

test('render legend includes object emoji mapping for text nouns', () => {
  const state: GameState = {
    levelIndex: 0,
    title: 'legend-emoji',
    width: 2,
    height: 1,
    items: [{ id: 1, name: 'baba', x: 0, y: 0, isText: true, props: [] }],
    rules: [],
    status: 'playing',
    turn: 0,
  }

  const output = render(state)
  assert.match(stripAnsi(output), /BA=baba🐑/)
})

test('render colors syntax words with syntax color in grid', () => {
  const state: GameState = {
    levelIndex: 0,
    title: 'syntax-grid-color',
    width: 4,
    height: 1,
    items: [
      { id: 1, name: 'is', x: 0, y: 0, isText: true, props: [] },
      { id: 2, name: 'and', x: 1, y: 0, isText: true, props: [] },
      { id: 3, name: 'not', x: 2, y: 0, isText: true, props: [] },
      { id: 4, name: 'has', x: 3, y: 0, isText: true, props: [] },
    ],
    rules: [],
    status: 'playing',
    turn: 0,
  }

  const lines = render(state).split('\n')
  const row = lines[3] ?? ''

  assert.equal(row.includes(`${ANSI_IS}IS`), true)
  assert.equal(row.includes(`${ANSI_IS}AN`), true)
  assert.equal(row.includes(`${ANSI_IS}NO`), true)
  assert.equal(row.includes(`${ANSI_IS}HA`), true)
  assert.equal(row.includes(`${ANSI_TEXT}IS`), false)
  assert.equal(row.includes(`${ANSI_TEXT}AN`), false)
  assert.equal(row.includes(`${ANSI_TEXT}NO`), false)
  assert.equal(row.includes(`${ANSI_TEXT}HA`), false)
})

test('render legend colors syntax words with syntax color', () => {
  const state: GameState = {
    levelIndex: 0,
    title: 'syntax-legend-color',
    width: 6,
    height: 1,
    items: [
      { id: 1, name: 'is', x: 0, y: 0, isText: true, props: [] },
      { id: 2, name: 'and', x: 1, y: 0, isText: true, props: [] },
      { id: 3, name: 'not', x: 2, y: 0, isText: true, props: [] },
      { id: 4, name: 'has', x: 3, y: 0, isText: true, props: [] },
    ],
    rules: [],
    status: 'playing',
    turn: 0,
  }

  const output = render(state)
  const lines = output.split('\n')
  const legendStart = lines.indexOf('Legend:')
  const legendOnly = lines.slice(Math.max(0, legendStart + 1)).join('\n')

  assert.equal(legendOnly.includes(`${ANSI_IS}IS`), true)
  assert.equal(legendOnly.includes(`${ANSI_IS}AN`), true)
  assert.equal(legendOnly.includes(`${ANSI_IS}NO`), true)
  assert.equal(legendOnly.includes(`${ANSI_IS}HA`), true)
  assert.equal(legendOnly.includes(`${ANSI_TEXT}IS`), false)
  assert.equal(legendOnly.includes(`${ANSI_TEXT}AN`), false)
  assert.equal(legendOnly.includes(`${ANSI_TEXT}NO`), false)
  assert.equal(legendOnly.includes(`${ANSI_TEXT}HA`), false)
})

test('render prefers YOU over text and movable in stacked cell', () => {
  const state: GameState = {
    levelIndex: 0,
    title: 'stack-you',
    width: 1,
    height: 1,
    items: [
      { id: 1, name: 'water', x: 0, y: 0, isText: false, props: ['move'] },
      { id: 2, name: 'rock', x: 0, y: 0, isText: true, props: [] },
      { id: 3, name: 'baba', x: 0, y: 0, isText: false, props: ['you'] },
    ],
    rules: [],
    status: 'playing',
    turn: 0,
  }

  const lines = render(state).split('\n')
  const row = lines[3] ?? ''

  assert.equal(row, '🐑')
})

test('render prefers text over movable in stacked cell when no YOU', () => {
  const state: GameState = {
    levelIndex: 0,
    title: 'stack-text',
    width: 1,
    height: 1,
    items: [
      { id: 1, name: 'water', x: 0, y: 0, isText: false, props: ['move'] },
      { id: 2, name: 'rock', x: 0, y: 0, isText: true, props: [] },
    ],
    rules: [],
    status: 'playing',
    turn: 0,
  }

  const lines = render(state).split('\n')
  const row = lines[3] ?? ''

  assert.equal(stripAnsi(row), 'RO')
})

test('render prefers move/fall over push/pull in stacked cell', () => {
  const state: GameState = {
    levelIndex: 0,
    title: 'stack-move-fall-over-push-pull',
    width: 1,
    height: 1,
    items: [
      { id: 1, name: 'rock', x: 0, y: 0, isText: false, props: ['pull'] },
      { id: 2, name: 'ghost', x: 0, y: 0, isText: false, props: ['fall'] },
    ],
    rules: [],
    status: 'playing',
    turn: 0,
  }

  const lines = render(state).split('\n')
  const row = lines[3] ?? ''

  assert.equal(row, '👻')
})

test('render prefers push/pull over open/shut in stacked cell', () => {
  const state: GameState = {
    levelIndex: 0,
    title: 'stack-push-pull-over-open-shut',
    width: 1,
    height: 1,
    items: [
      { id: 1, name: 'door', x: 0, y: 0, isText: false, props: ['open'] },
      { id: 2, name: 'rock', x: 0, y: 0, isText: false, props: ['pull'] },
    ],
    rules: [],
    status: 'playing',
    turn: 0,
  }

  const lines = render(state).split('\n')
  const row = lines[3] ?? ''

  assert.equal(row, '🪨')
})

test('render prefers open/shut over else in stacked cell', () => {
  const state: GameState = {
    levelIndex: 0,
    title: 'stack-open-shut-over-else',
    width: 1,
    height: 1,
    items: [
      { id: 1, name: 'moon', x: 0, y: 0, isText: false, props: [] },
      { id: 2, name: 'door', x: 0, y: 0, isText: false, props: ['open'] },
    ],
    rules: [],
    status: 'playing',
    turn: 0,
  }

  const lines = render(state).split('\n')
  const row = lines[3] ?? ''

  assert.equal(row, '🚪')
})

test('render excludes ground-hug objects from upright stack priority', () => {
  const state: GameState = {
    levelIndex: 0,
    title: 'stack-ground-hug-excluded',
    width: 1,
    height: 1,
    items: [
      { id: 1, name: 'tile', x: 0, y: 0, isText: false, props: ['you'] },
      { id: 2, name: 'skull', x: 0, y: 0, isText: false, props: ['defeat'] },
    ],
    rules: [],
    status: 'playing',
    turn: 0,
  }

  const lines = render(state).split('\n')
  const row = lines[3] ?? ''

  assert.equal(row, '💀')
})

test('render does not display HIDE items in board or legend', () => {
  const state: GameState = {
    levelIndex: 0,
    title: 'hide-visibility',
    width: 1,
    height: 1,
    items: [
      { id: 1, name: 'baba', x: 0, y: 0, isText: true, props: ['hide'] },
      { id: 2, name: 'rock', x: 0, y: 0, isText: false, props: [] },
    ],
    rules: [],
    status: 'playing',
    turn: 0,
  }

  const output = render(state)
  const lines = output.split('\n')
  const row = lines[3] ?? ''

  assert.equal(row, '🪨')
  assert.doesNotMatch(stripAnsi(output), /BA=baba/)
})

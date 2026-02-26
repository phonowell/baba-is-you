import assert from 'node:assert/strict'
import test from 'node:test'

import { render } from './render.js'

import type { GameState } from '../logic/types.js'

const stripAnsi = (value: string): string =>
  value.replace(/\x1b\[[0-9;]*m/g, '')

const graphemes = (value: string): string[] =>
  Array.from(new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(value), ({ segment }) => segment)

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

test('render prefers movable object over static object in stacked cell', () => {
  const state: GameState = {
    levelIndex: 0,
    title: 'stack-priority',
    width: 1,
    height: 1,
    items: [
      { id: 1, name: 'rock', x: 0, y: 0, isText: false, props: [] },
      { id: 2, name: 'water', x: 0, y: 0, isText: false, props: ['move'] },
    ],
    rules: [],
    status: 'playing',
    turn: 0,
  }

  const lines = render(state).split('\n')
  const row = lines[3] ?? ''

  assert.equal(row, '🌊')
})

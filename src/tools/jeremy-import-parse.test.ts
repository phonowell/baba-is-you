import assert from 'node:assert/strict'
import test from 'node:test'

import { parseMapLayers } from './jeremy-import-parse.js'

test('parseMapLayers trims leading and trailing blank lines in one layer', () => {
  const lines = ['title = demo', '---', '', '', 'ab', 'cd', '', '']
  const layers = parseMapLayers(lines, 1)
  assert.deepEqual(layers, [['ab', 'cd']])
})

test('parseMapLayers trims leading and trailing whitespace-only lines', () => {
  const lines = ['title = demo', '---', '   ', '\t', 'ab', 'cd', '  ', '']
  const layers = parseMapLayers(lines, 1)
  assert.deepEqual(layers, [['ab', 'cd']])
})

test('parseMapLayers keeps middle blank lines after edge trimming', () => {
  const lines = ['meta = demo', '---', '', 'ab', '', 'cd', '', '']
  const layers = parseMapLayers(lines, 1)
  assert.deepEqual(layers, [['ab', '', 'cd']])
})

test('parseMapLayers trims edge-empty layers around multi-layer maps', () => {
  const lines = ['meta = demo', '---', '', 'A', '', '+++', '', 'B', '', '+++', '', '']
  const layers = parseMapLayers(lines, 1)
  assert.deepEqual(layers, [['A'], ['B']])
})

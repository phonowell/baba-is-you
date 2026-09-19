import assert from 'node:assert/strict'
import test from 'node:test'

import { levels } from '../levels.js'
import { parseLevel } from '../logic/parse-level.js'

import { OBJECT_GLYPHS } from './render-config.js'

const collectLevelEntityNames = (): string[] => {
  const names = new Set<string>()
  for (const rawLevel of levels) {
    const level = parseLevel(rawLevel)
    for (const item of level.items) {
      if (item.isText) continue
      names.add(item.name)
    }
  }

  return Array.from(names).sort()
}

test('OBJECT_GLYPHS has no duplicate emoji values', () => {
  const glyphToNames = new Map<string, string[]>()

  for (const [name, glyph] of Object.entries(OBJECT_GLYPHS)) {
    const list = glyphToNames.get(glyph) ?? []
    list.push(name)
    glyphToNames.set(glyph, list)
  }

  const duplicates = Array.from(glyphToNames.entries())
    .filter(([, names]) => names.length > 1)
    .map(([glyph, names]) => ({ glyph, names: names.sort() }))

  assert.deepEqual(duplicates, [])
})

test('OBJECT_GLYPHS avoids platform-fragile glyphs', () => {
  const fragileGlyphs = new Set(['🪸', '🫧', '🍄‍🟫', '🪹', '🪼', '🪻'])
  const found = Object.entries(OBJECT_GLYPHS)
    .filter(([, glyph]) => fragileGlyphs.has(glyph))
    .map(([name, glyph]) => ({ name, glyph }))

  assert.deepEqual(found, [])
})

test('OBJECT_GLYPHS covers all non-text entities used in levels', () => {
  const levelEntities = collectLevelEntityNames()
  const missing = levelEntities.filter((name) => !(name in OBJECT_GLYPHS))

  assert.deepEqual(missing, [])
})

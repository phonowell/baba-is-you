#!/usr/bin/env tsx
// Converts `levels/*.txt` fixtures from the predecessor's ASCII format
// (`../baba/levels`) into our entity-list level format — the same grammar
// `src/levels-data/*.ts` uses and `src/logic/parse-level.ts` parses:
//
//   Title NAME;
//   Size WxH;
//   Background transparent;
//   <key> <x,y> <x,y> ...;
//
// The ASCII format loses objects stacked on `tile` cells (one glyph per cell
// per layer); the entity list carries every item independently.
//
// `LevelData.meta` (palette/backgrounds/color overrides) is dropped: nothing
// consumes it (view uses sprite palettes); `../baba` retains the source data.
//
// Usage:
//   tsx scripts/convert-ascii-levels.ts          verify only (default): each
//                                              converted file's item multiset
//                                              must equal ../baba's (added
//                                              tiles allowed)
//   tsx scripts/convert-ascii-levels.ts --write  re-emit converted files —
//                                              regenerates from ../baba and
//                                              drops restored tiles

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

import { parseAsciiLevel } from '../src/logic/parse-ascii-level.js'
import { parseLevel } from '../src/logic/parse-level.js'

import type { LevelData, LevelItem } from '../src/logic/types.js'

const WRITE = process.argv.includes('--write')
const BABA_LEVELS = new URL('../../baba/levels/', import.meta.url).pathname
const OUR_LEVELS = new URL('../levels/', import.meta.url).pathname

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry)
    return statSync(path).isDirectory() ? walk(path) : [path]
  })

const statementKey = (item: LevelItem): string => {
  const base = item.isText
    ? `${item.name[0]?.toUpperCase() ?? ''}${item.name.slice(1)}`
    : item.name
  return item.dir ? `${base}@${item.dir}` : base
}

const renderEntityList = (level: LevelData): string => {
  const grouped = new Map<string, string[]>()
  for (const item of level.items) {
    const key = statementKey(item)
    const coords = grouped.get(key) ?? []
    coords.push(`${item.x},${item.y}`)
    grouped.set(key, coords)
  }
  const lines = [
    `Title ${level.title};`,
    `Size ${level.width}x${level.height};`,
    'Background transparent;',
  ]
  for (const key of Array.from(grouped.keys()).sort((a, b) =>
    a.localeCompare(b),
  )) {
    lines.push(`${key} ${grouped.get(key)?.join(' ')};`)
  }
  return `${lines.join('\n')}\n`
}

// Canonical item multiset: order- and id-free so the two parsers' different
// emission orders don't matter.
const itemKey = (item: LevelItem): string =>
  `${item.name}${item.isText ? '!' : ''}@${item.x},${item.y}@${item.dir ?? ''}`

const diffMultisets = (
  a: LevelItem[],
  b: LevelItem[],
): { onlyA: string[]; onlyB: string[] } => {
  const count = (items: LevelItem[]): Map<string, number> => {
    const m = new Map<string, number>()
    for (const item of items) m.set(itemKey(item), (m.get(itemKey(item)) ?? 0) + 1)
    return m
  }
  const ca = count(a)
  const cb = count(b)
  const onlyA: string[] = []
  const onlyB: string[] = []
  for (const [key, n] of ca) {
    const extra = n - (cb.get(key) ?? 0)
    for (let i = 0; i < extra; i += 1) onlyA.push(key)
  }
  for (const [key, n] of cb) {
    const extra = n - (ca.get(key) ?? 0)
    for (let i = 0; i < extra; i += 1) onlyB.push(key)
  }
  return { onlyA: onlyA.sort(), onlyB: onlyB.sort() }
}

const isAddedTile = (key: string): boolean => /^tile[^!]*@/.test(key)

let converted = 0
let mismatched = 0
let matched = 0
for (const path of walk(OUR_LEVELS).sort()) {
  if (!path.endsWith('.txt')) continue
  const rel = relative(OUR_LEVELS, path)
  const babaPath = join(BABA_LEVELS, rel)
  let source: string
  try {
    source = readFileSync(babaPath, 'utf8')
  } catch {
    console.log(`✗ ${rel}: no ../baba counterpart`)
    mismatched += 1
    continue
  }

  const babaLevel = parseAsciiLevel(source, rel)

  if (WRITE) {
    writeFileSync(path, renderEntityList(babaLevel))
    converted += 1
    continue
  }

  const ours = parseLevel(readFileSync(path, 'utf8'))
  if (ours.title !== babaLevel.title) {
    console.log(`✗ ${rel}: title '${ours.title}' != '${babaLevel.title}'`)
    mismatched += 1
    continue
  }
  if (ours.width !== babaLevel.width || ours.height !== babaLevel.height) {
    console.log(
      `✗ ${rel}: size ${ours.width}x${ours.height} != ${babaLevel.width}x${babaLevel.height}`,
    )
    mismatched += 1
    continue
  }
  const { onlyA, onlyB } = diffMultisets(ours.items, babaLevel.items)
  const unexpectedA = onlyA.filter((k) => !isAddedTile(k))
  if (unexpectedA.length || onlyB.length) {
    console.log(`✗ ${rel}:`)
    for (const k of unexpectedA) console.log(`    ours-only ${k}`)
    for (const k of onlyB) console.log(`    baba-only ${k}`)
    mismatched += 1
    continue
  }
  const addedTiles = onlyA.length
  if (addedTiles) console.log(`✓ ${rel} (+${addedTiles} restored tiles)`)
  matched += 1
}

if (WRITE) {
  console.log(`converted ${converted} files`)
} else {
  console.log(`checked: ${matched} equal (+restored tiles), ${mismatched} mismatched`)
  if (mismatched > 0) process.exit(1)
}

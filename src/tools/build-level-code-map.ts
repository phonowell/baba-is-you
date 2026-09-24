#!/usr/bin/env tsx
import { promises as fs } from 'node:fs'
import path from 'node:path'

import { levels } from '../levels.js'
import { runCliMain } from './cli.js'
import {
  WORLDS,
  isMapFile,
  loadParsedOfficialLevels,
  collectConvertedLevels,
  loadGoldenLayoutSignatures,
} from './import-official-levels.js'
import { buildGlobalReference } from './import-official-levels-global-reference.js'
import { loadCanonicalObjects } from './import-official-levels-object-table.js'
import { parseLd } from './import-official-levels-parse.js'

// Rebuilds `level-code-map.json`: community solution filenames identify
// levels by the in-game code (`Level Chasm-Extra 1`, `Level Lake-3`),
// which the official engine derives in map.lua `getlevelid()` from the
// hub map's `mapid` plus the entry's style/number (style=1 → letter,
// style=2 → "Extra <number+1>", otherwise the bare number) — overridable
// by the target's own `mapid`/langtext `<file>_mapid` (Finale, ?, Secret).
//
// The map pins a code to a campaign index so same-title variants across
// worlds bind to the exact board the community oracle was recorded on.
// Run after re-importing official levels:
//   pnpm tsx src/tools/build-level-code-map.ts

const main = async (): Promise<void> => {
  const cwd = process.cwd()
  const dataRoot = path.resolve(cwd, 'data', 'Baba Is You', 'Data')
  const outFile = path.resolve(cwd, 'src', 'tools', 'level-code-map.json')

  // Replay the import pipeline so converted[i] aligns with levels[i];
  // a body mismatch would mean the data files changed without a rebuild.
  const parsed = []
  for (const world of WORLDS) {
    parsed.push(
      ...(await loadParsedOfficialLevels(
        path.join(dataRoot, 'Worlds', world),
        world,
      )),
    )
  }
  const global = buildGlobalReference(parsed)
  const canon = await loadCanonicalObjects(dataRoot)
  // Admission must replay identically to the import run — including the
  // golden exemption — or converted[] stops aligning with levels[].
  const goldenLayouts = await loadGoldenLayoutSignatures(
    path.resolve(cwd, 'goldens'),
  )
  const fileToIndex = new Map<string, number>()
  let cursor = 0
  for (const world of WORLDS) {
    const result = collectConvertedLevels(
      parsed.filter((p) => p.world === world),
      global,
      canon,
      goldenLayouts,
    )
    for (const c of result.converted) {
      fileToIndex.set(`${world}:${c.source.replace(/\.l$/i, '')}`, cursor)
      const stored = levels[cursor]
      if (stored === undefined || c.body.trim() !== stored.trim()) {
        throw new Error(
          `[${world}] ${c.source} drifted from levels[${cursor}] — re-run pnpm import-levels:official`,
        )
      }
      cursor += 1
    }
  }

  const lang = new Map<string, string>()
  const langSrc = await fs.readFile(
    path.join(dataRoot, 'Languages', 'lang_en.txt'),
    'utf8',
  )
  for (const line of langSrc.split(/\r?\n/)) {
    const m = /^(\w*level_mapid|mapid_extra)=(.*)$/.exec(line)
    if (m?.[1] !== undefined && m[2] !== undefined) lang.set(m[1], m[2])
  }
  const langMapid = (file: string): string | undefined =>
    lang.get(`${file}_mapid`)

  const allLd = new Map<string, ReturnType<typeof parseLd>>()
  for (const world of WORLDS) {
    const dir = path.join(dataRoot, 'Worlds', world)
    for (const f of (await fs.readdir(dir)).filter((f) => f.endsWith('.ld'))) {
      allLd.set(
        `${world}:${f.replace(/\.ld$/i, '')}`,
        parseLd(await fs.readFile(path.join(dir, f), 'utf8')),
      )
    }
  }

  const letters = 'abcdefghijklmnopqrstuvwxyz'
  const codeMap: Record<string, { file: string; index: number | null; name: string }> = {}
  for (const [key, ld] of allLd) {
    if (!isMapFile(ld)) continue
    const [world, file] = key.split(':') as [string, string]
    const mapid = langMapid(file) ?? ld.general.get('mapid') ?? ''
    const count = Number(ld.general.get('levels') ?? 0)
    for (let i = 0; i < count; i++) {
      const target = ld.levels.get(`${i}file`) ?? ''
      const number = Number(ld.levels.get(`${i}number`) ?? 0)
      const style = Number(ld.levels.get(`${i}style`) ?? 0)
      const name = ld.levels.get(`${i}name`) ?? ''
      const base = target.replace(/\.l$/i, '')
      const tmapid =
        langMapid(base) ?? allLd.get(`${world}:${base}`)?.general.get('mapid')
      // `<empty>` mapids display no code at all (map links, decoration).
      if (tmapid === '<empty>') continue
      let id: string
      if (tmapid !== undefined && tmapid.length > 0) id = tmapid
      else if (style === 1) id = (letters[number] ?? '?').toUpperCase()
      else if (style === 2) id = `${lang.get('mapid_extra') ?? 'Extra'} ${number + 1}`
      else id = String(number)
      // Only the root Map hub displays bare ids (`Level 9`); nested hubs
      // prefix with the hub's mapid (`Level Chasm-Extra 1`). Hubs with no
      // mapid (center/Null) still prefix by name so their entries can't
      // collide with the Map hub's numbered codes.
      const code = mapid === 'Map'
        ? id
        : `${mapid === '' || mapid === '<empty>' ? (ld.general.get('name') ?? file) : mapid}-${id}`
      const index = fileToIndex.get(`${world}:${base}`) ?? null
      // A code can repeat on a hub (duplicate map icons) — keep the
      // entry that resolves to a playable campaign level.
      const prior = codeMap[code]
      if (prior !== undefined && prior.index !== null && index === null) continue
      codeMap[code] = { file: base, index, name }
    }
  }

  await fs.writeFile(outFile, `${JSON.stringify(codeMap, null, 1)}\n`, 'utf8')
  const bound = Object.values(codeMap).filter((e) => e.index !== null).length
  console.log(`wrote ${outFile}: ${Object.keys(codeMap).length} codes, ${bound} bound`)
}

runCliMain(import.meta.url, main)

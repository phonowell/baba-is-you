import {
  normalizeRawName,
  parseCurrobjEntries,
  toTileKey,
} from './import-official-levels-parse.js'
import { buildLevelTileMap } from './import-official-levels-tile-map.js'
import { forEachBoardTile } from './import-official-levels-binary.js'

import type { ParsedLayer } from './import-official-levels-binary.js'
import type { CanonicalObjectTable } from './import-official-levels-object-table.js'
import type { LdData, TileDescriptor } from './import-official-levels-parse.js'
import type { GlobalReference } from './import-official-levels-global-reference.js'

export type VerifySample = {
  fileName: string
  tileKey: string
  expected: string
  actual: string
}

export type VerifyResult = {
  levels: number
  currobjTilePairs: number
  // Tiles whose currobj palette claims two different object slots — the
  // resolver then picks one, so these need eyeballing when non-zero.
  ambiguousCurrobjTiles: number
  // Tiles where the resolved object differs from the currobj palette
  // name — the [tiles]-override mechanism working as intended.
  tileMapMismatches: number
  usedTileTruthChecks: number
  usedTileTruthMismatches: number
  unknownTileKeys: string[]
  samples: VerifySample[]
}

type ParsedOfficialLevelInput = {
  fileName: string
  ld: LdData
  layers: ParsedLayer[]
}

const describeTile = (tile: TileDescriptor): string =>
  `${tile.isText ? 'text_' : ''}${tile.name}`

const tileEquals = (a: TileDescriptor, b: TileDescriptor): boolean =>
  a.name === b.name && a.isText === b.isText

export const verifyOfficialImportConsistency = (
  parsed: ParsedOfficialLevelInput[],
  global: GlobalReference,
  canon: CanonicalObjectTable,
): VerifyResult => {
  let currobjTilePairs = 0
  let ambiguousCurrobjTiles = 0
  let tileMapMismatches = 0
  let usedTileTruthChecks = 0
  let usedTileTruthMismatches = 0
  const samples: VerifySample[] = []
  const unknownTileCounts = new Map<string, number>()

  for (const level of parsed) {
    const tileMap = buildLevelTileMap(level.ld, global, canon)
    // Ambiguity is an objectId-level question: several distinct slots
    // claiming one atlas position. (Several names for ONE slot are normal
    // — [tiles] overrides settle those.)
    const claimantsByTile = new Map<string, Set<string>>()
    const nameClaimsByTile = new Map<string, Set<string>>()
    for (const entry of parseCurrobjEntries(level.ld)) {
      if (!entry.tileKey) continue
      if (entry.objectId) {
        const slots = claimantsByTile.get(entry.tileKey) ?? new Set<string>()
        slots.add(entry.objectId)
        claimantsByTile.set(entry.tileKey, slots)
      }
      if (entry.name) {
        currobjTilePairs += 1
        const names = nameClaimsByTile.get(entry.tileKey) ?? new Set<string>()
        names.add(describeTile(normalizeRawName(entry.name, false)))
        nameClaimsByTile.set(entry.tileKey, names)
      }
    }
    for (const slots of claimantsByTile.values()) {
      if (slots.size > 1) ambiguousCurrobjTiles += 1
    }

    for (const [tileKey, names] of nameClaimsByTile.entries()) {
      const actual = tileMap.get(tileKey)
      const anyMatch =
        actual &&
        Array.from(names).some((name) =>
          tileEquals(actual, {
            name: name.replace(/^text_/, ''),
            isText: name.startsWith('text_'),
          }),
        )
      if (actual && anyMatch) continue
      tileMapMismatches += 1
      if (samples.length < 30) {
        samples.push({
          fileName: level.fileName,
          tileKey,
          expected: Array.from(names).join('|'),
          actual: actual ? describeTile(actual) : '<missing>',
        })
      }
    }

    forEachBoardTile(level.layers, (_layer, tileX, tileY) => {
      const tileKey = toTileKey(tileX, tileY)
      const claims = nameClaimsByTile.get(tileKey)
      if (claims) {
        usedTileTruthChecks += 1
        const actual = tileMap.get(tileKey)
        const anyMatch =
          actual &&
          Array.from(claims).some((name) =>
            tileEquals(actual, {
              name: name.replace(/^text_/, ''),
              isText: name.startsWith('text_'),
            }),
          )
        if (!anyMatch) usedTileTruthMismatches += 1
      }
      if (!tileMap.get(tileKey)) {
        unknownTileCounts.set(
          tileKey,
          (unknownTileCounts.get(tileKey) ?? 0) + 1,
        )
      }
    })
  }

  const unknownTileKeys = Array.from(unknownTileCounts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([tileKey]) => tileKey)

  return {
    levels: parsed.length,
    currobjTilePairs,
    ambiguousCurrobjTiles,
    tileMapMismatches,
    usedTileTruthChecks,
    usedTileTruthMismatches,
    unknownTileKeys,
    samples,
  }
}

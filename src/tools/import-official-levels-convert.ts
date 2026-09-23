import path from 'node:path'

import {
  parseDirection,
  toStatementKey,
  toTileKey,
} from './import-official-levels-parse.js'
import { buildLevelTileMap } from './import-official-levels-tile-map.js'
import {
  croppedBounds,
  forEachBoardTile,
} from './import-official-levels-binary.js'

import type { ParsedLayer } from './import-official-levels-binary.js'
import type { CanonicalObjectTable } from './import-official-levels-object-table.js'
import type { LdData, TileDescriptor } from './import-official-levels-parse.js'
import type { GlobalReference } from './import-official-levels-global-reference.js'

export type ConvertedLevel = { body: string; source: string }

export type TextTileCounts = {
  youTextCount: number
  winTextCount: number
  facingTextCount: number
}

export type ConvertedLevelMeta = {
  titleRaw: string
  textTiles: TextTileCounts
}

export type ConvertOneLevelResult = {
  level: ConvertedLevel
  unknownTileKeys: string[]
  meta: ConvertedLevelMeta
}

export const convertOneLevel = (
  fileName: string,
  ld: LdData,
  layers: ParsedLayer[],
  global: GlobalReference,
  canon: CanonicalObjectTable,
): ConvertOneLevelResult => {
  const firstLayer = layers[0]
  if (!firstLayer) throw new Error(`No layer found in ${fileName}`)
  const bounds = croppedBounds(firstLayer.width, firstLayer.height)
  const { width, height } = bounds

  const tileMap = buildLevelTileMap(ld, global, canon)
  const grouped = new Map<string, Set<string>>()
  const unknownTiles = new Set<string>()
  let youTextCount = 0
  let winTextCount = 0
  let facingTextCount = 0

  forEachBoardTile(layers, (layer, tileX, tileY, x, y, index) => {
    const tileKey = toTileKey(tileX, tileY)
    let resolved = tileMap.get(tileKey)
    if (!resolved) {
      unknownTiles.add(tileKey)
      resolved = {
        name: `tile_${tileX}_${tileY}`,
        isText: false,
      } satisfies TileDescriptor
    }
    if (resolved.isText) {
      if (resolved.name === 'you') youTextCount += 1
      if (resolved.name === 'win') winTextCount += 1
      if (resolved.name === 'facing') facingTextCount += 1
    }

    const dataValue = layer.data?.[index]
    const dir = resolved.isText ? undefined : parseDirection(dataValue)
    const key = toStatementKey(resolved, dir)
    const coords = grouped.get(key) ?? new Set<string>()
    coords.add(`${x - bounds.minX},${y - bounds.minY}`)
    grouped.set(key, coords)
  })

  const titleRaw =
    ld.general.get('name') ??
    path.basename(fileName, '.l').replace(/level$/i, '')
  const title = titleRaw.toUpperCase()
  const lines = [
    `Title ${title};`,
    `Size ${width}x${height};`,
    'Background transparent;',
  ]

  const keys = Array.from(grouped.keys()).sort((a, b) => a.localeCompare(b))
  for (const key of keys) {
    const coords = grouped.get(key)
    if (!coords?.size) continue
    lines.push(`${key} ${Array.from(coords).join(' ')};`)
  }

  return {
    level: {
      source: fileName,
      body: lines.join('\n'),
    },
    unknownTileKeys: Array.from(unknownTiles).sort((a, b) =>
      a.localeCompare(b),
    ),
    meta: {
      titleRaw,
      textTiles: {
        youTextCount,
        winTextCount,
        facingTextCount,
      },
    },
  }
}

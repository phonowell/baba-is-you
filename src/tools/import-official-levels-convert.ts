import path from 'node:path'

import { DEFAULT_OBJECT_ASSIGNMENTS } from './import-official-levels-default-assignments.js'
import {
  normalizeRawName,
  parseDirection,
  tileKeyToObjectId,
  toStatementKey,
  toTileKey,
} from './import-official-levels-parse.js'
import { buildLevelTileMap } from './import-official-levels-tile-map.js'

import type { ParsedLayer } from './import-official-levels-binary.js'
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
): ConvertOneLevelResult => {
  const firstLayer = layers[0]
  if (!firstLayer) throw new Error(`No layer found in ${fileName}`)
  const rawWidth = firstLayer.width
  const rawHeight = firstLayer.height
  const crop = rawWidth > 2 && rawHeight > 2
  const width = crop ? rawWidth - 2 : rawWidth
  const height = crop ? rawHeight - 2 : rawHeight
  const minX = crop ? 1 : 0
  const minY = crop ? 1 : 0
  const maxX = crop ? rawWidth - 2 : rawWidth - 1
  const maxY = crop ? rawHeight - 2 : rawHeight - 1

  const tileMap = buildLevelTileMap(ld, global)
  const grouped = new Map<string, Set<string>>()
  const unknownTiles = new Set<string>()
  let youTextCount = 0
  let winTextCount = 0
  let facingTextCount = 0

  for (const layer of layers) {
    if (layer.width !== rawWidth || layer.height !== rawHeight) continue
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const index = y * rawWidth + x
        const tileX = layer.main[index * 2] ?? 255
        const tileY = layer.main[index * 2 + 1] ?? 255
        if (tileX === 255 && tileY === 255) continue

        const tileKey = toTileKey(tileX, tileY)
        let resolved = tileMap.get(tileKey)
        if (!resolved) {
          const objectId = tileKeyToObjectId(tileKey)
          const assignment =
            objectId !== null ? DEFAULT_OBJECT_ASSIGNMENTS[objectId] : undefined
          if (assignment) resolved = normalizeRawName(assignment, false)
        }
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
        const xOut = x - minX
        const yOut = y - minY
        const coords = grouped.get(key) ?? new Set<string>()
        coords.add(`${xOut},${yOut}`)
        grouped.set(key, coords)
      }
    }
  }

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

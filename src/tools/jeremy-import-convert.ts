import { promises as fs } from 'node:fs'

import {
  decodeChar,
  getTopNoun,
  parseLegendDescriptor,
} from './jeremy-import-decode.js'
import {
  lastMetaNumber,
  parseCoordinateList,
  parseMapLayers,
  parseMetaEntries,
  parsePlusSymbols,
  toPlacedStatementKey,
  toTitle,
} from './jeremy-import-parse.js'

import type {
  ConvertedLevel,
  LegendEntry,
  PlacedItem,
  StopResult,
} from './jeremy-import-types.js'

export const convertOneLevel = async (
  absFile: string,
  relFile: string,
): Promise<
  | {
      level: ConvertedLevel
      stop: null
    }
  | {
      level: null
      stop: StopResult
    }
> => {
  const source = (await fs.readFile(absFile, 'utf8')).replace(/\r\n/g, '\n')
  const lines = source.split('\n')
  const delimiterIndex = lines.findIndex(
    (line) => line === '---' || line === '+++',
  )
  if (delimiterIndex < 0) {
    return {
      level: null,
      stop: { file: relFile, reason: 'missing map delimiter line' },
    }
  }

  const meta = parseMetaEntries(lines.slice(0, delimiterIndex))
  const layers = parseMapLayers(lines, delimiterIndex)
  const leftPad = lastMetaNumber(meta, 'left pad')
  const rightPad = lastMetaNumber(meta, 'right pad')
  const topPad = lastMetaNumber(meta, 'top pad')
  const bottomPad = lastMetaNumber(meta, 'bottom pad')

  const legend = new Map<string, LegendEntry>()
  for (const entry of meta) {
    if (entry.key.startsWith('+')) continue
    if (Array.from(entry.key).length !== 1) continue

    const items = parseLegendDescriptor(entry.value)
    legend.set(entry.key.toLowerCase(), {
      items,
      topNoun: getTopNoun(items),
    })
  }

  let mapWidth = 0
  let mapHeight = 0
  for (const layer of layers) {
    mapHeight = Math.max(mapHeight, layer.length)
    for (const line of layer)
      mapWidth = Math.max(mapWidth, Array.from(line).length)
  }

  const width = leftPad + mapWidth + rightPad
  const height = topPad + mapHeight + bottomPad
  const placed: PlacedItem[] = []

  for (const layer of layers) {
    for (let y = 0; y < layer.length; y += 1) {
      const line = layer[y] ?? ''
      const chars = Array.from(line)
      for (let x = 0; x < chars.length; x += 1) {
        const char = chars[x]
        if (!char) continue
        const decoded = decodeChar(char, legend)
        for (const item of decoded) {
          placed.push({
            ...item,
            x: x + leftPad,
            y: y + topPad,
          })
        }
      }
    }
  }

  for (const entry of meta) {
    if (!entry.key.startsWith('+')) continue

    const symbols = parsePlusSymbols(entry.key)
    const coordinates = parseCoordinateList(entry.value)
    if (!symbols.length || !coordinates.length) continue

    for (const symbol of symbols) {
      const quoted =
        symbol.length >= 2 && symbol.startsWith('"') && symbol.endsWith('"')
      const items = quoted
        ? [{ name: symbol.slice(1, -1).toLowerCase(), isText: true }]
        : decodeChar(symbol, legend)
      for (const coord of coordinates) {
        for (const item of items) {
          placed.push({
            ...item,
            x: coord.x + leftPad,
            y: coord.y + topPad,
          })
        }
      }
    }
  }

  const grouped = new Map<string, string[]>()
  for (const item of placed) {
    const key = toPlacedStatementKey(item)
    const coords = grouped.get(key) ?? []
    coords.push(`${item.x},${item.y}`)
    grouped.set(key, coords)
  }

  const linesOut = [
    `Title ${toTitle(relFile)};`,
    `Size ${width}x${height};`,
    'Background transparent;',
  ]
  const keys = Array.from(grouped.keys()).sort((a, b) => a.localeCompare(b))
  for (const key of keys) {
    const coords = grouped.get(key)
    if (!coords?.length) continue
    linesOut.push(`${key} ${coords.join(' ')};`)
  }

  return {
    level: {
      source: relFile,
      body: linesOut.join('\n'),
    },
    stop: null,
  }
}

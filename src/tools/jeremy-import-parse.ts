import path from 'node:path'

import type {
  MetaEntry,
  ParsedItem,
  PlacedItem,
} from './jeremy-import-types.js'

export const parseMetaEntries = (metaLines: string[]): MetaEntry[] =>
  metaLines
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const splitAt = line.indexOf(' = ')
      if (splitAt < 0) return null
      const key = line.slice(0, splitAt).trim()
      const value = line.slice(splitAt + ' = '.length).trim()
      if (!key || !value) return null
      return { key, value }
    })
    .filter((entry): entry is MetaEntry => entry !== null)

export const lastMetaNumber = (meta: MetaEntry[], key: string): number => {
  for (let i = meta.length - 1; i >= 0; i -= 1) {
    const entry = meta[i]
    if (entry?.key !== key) continue

    const parsed = Number(entry.value)
    if (Number.isFinite(parsed)) return Math.max(0, parsed)
  }
  return 0
}

export const parseMapLayers = (
  lines: string[],
  delimiterIndex: number,
): string[][] => {
  const isBlankLine = (line: string | undefined): boolean =>
    (line?.trim().length ?? 0) === 0

  const layers: string[][] = [[]]
  for (const line of lines.slice(delimiterIndex + 1)) {
    if (line === '---' || line === '+++') {
      layers.push([])
      continue
    }
    const current = layers[layers.length - 1]
    if (!current) continue
    current.push(line)
  }

  const trimLayerEdges = (layer: string[]): string[] => {
    let start = 0
    let end = layer.length - 1
    while (start <= end && isBlankLine(layer[start])) start += 1
    while (end >= start && isBlankLine(layer[end])) end -= 1
    if (start > end) return []
    return layer.slice(start, end + 1)
  }

  const normalized = layers.map((layer) => trimLayerEdges(layer))

  while (normalized.length > 0 && (normalized[0]?.length ?? 0) === 0)
    normalized.shift()
  while (
    normalized.length > 0 &&
    (normalized[normalized.length - 1]?.length ?? 0) === 0
  )
    normalized.pop()

  if (!normalized.length) return [[]]
  return normalized
}

export const parseCoordinateList = (
  value: string,
): Array<{ x: number; y: number }> =>
  value
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0)
    .map((token) => {
      const [xRaw, yRaw] = token.split(',')
      if (!xRaw || !yRaw) return null
      const x = Number(xRaw)
      const y = Number(yRaw)
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null
      return { x, y }
    })
    .filter((coord): coord is { x: number; y: number } => coord !== null)

export const parsePlusSymbols = (rawKey: string): string[] =>
  rawKey
    .slice(1)
    .split(',')
    .map((token) => token.trim())
    .filter((token) => token.length > 0)

export const toTitle = (relativePath: string): string => {
  const base = path.basename(relativePath, '.txt')
  const stripPrefix = base.replace(/^(?:\d+|extra-\d+|[a-z])-/, '')
  const normalize = stripPrefix.replace(/-/g, ' ').trim()
  if (!normalize.length) return relativePath.toUpperCase()

  return normalize.toUpperCase()
}

const toStatementKey = (item: ParsedItem): string => {
  if (!item.isText) return item.name
  if (!item.name.length) return item.name
  return `${item.name[0]?.toUpperCase() ?? ''}${item.name.slice(1)}`
}

export const toPlacedStatementKey = (item: PlacedItem): string => {
  const base = toStatementKey(item)
  if (item.isText || !item.dir) return base
  return `${base}@${item.dir}`
}

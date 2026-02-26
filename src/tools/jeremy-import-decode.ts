import {
  GLYPH_TO_NOUN,
  GLYPH_TO_TEXT,
  OVERWORLD_GLYPHS,
} from './jeremy-import-glyphs.js'

import type { LegendEntry, ParsedItem } from './jeremy-import-types.js'

const parseDirection = (
  value: string | undefined,
): ParsedItem['dir'] | undefined => {
  if (!value) return undefined

  const lower = value.toLowerCase()
  if (
    lower === 'up' ||
    lower === 'right' ||
    lower === 'down' ||
    lower === 'left'
  )
    return lower

  return undefined
}

export const parseLegendDescriptor = (raw: string): ParsedItem[] => {
  const parts = raw
    .split(' on ')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
  const reversed = parts.reverse()
  const items: ParsedItem[] = []

  for (const part of reversed) {
    const tokens = part.split(/\s+/)
    const first = tokens[0]
    if (!first) continue

    const quoted =
      first.length >= 2 && first.startsWith('"') && first.endsWith('"')
    const name = quoted
      ? first.slice(1, -1).toLowerCase()
      : first.toLowerCase() === 'map'
        ? 'map'
        : first.toLowerCase()
    const isText = quoted
    const dir = isText ? undefined : parseDirection(tokens[1])
    items.push({
      name,
      isText,
      ...(dir ? { dir } : {}),
    })
  }

  return items
}

const isUpperCaseChar = (char: string): boolean =>
  char.toUpperCase() === char && char.toLowerCase() !== char

const toMarkerNoun = (char: string): string =>
  `marker-u${char.codePointAt(0)?.toString(16) ?? '0'}`

const toFallbackGlyphNoun = (char: string): string =>
  `glyph-u${char.codePointAt(0)?.toString(16) ?? '0'}`

export const getTopNoun = (items: ParsedItem[]): string | null => {
  for (let i = items.length - 1; i >= 0; i -= 1) {
    const item = items[i]
    if (!item || item.isText) continue
    return item.name
  }
  return null
}

export const decodeChar = (
  char: string,
  legend: Map<string, LegendEntry>,
): ParsedItem[] => {
  if (char === ' ') return []

  const legendEntry = legend.get(char.toLowerCase())
  if (legendEntry) {
    if (isUpperCaseChar(char)) {
      if (!legendEntry.topNoun) return []
      return [{ name: legendEntry.topNoun, isText: true }]
    }
    return legendEntry.items
  }

  const textWord = GLYPH_TO_TEXT.get(char)
  if (textWord) return [{ name: textWord, isText: true }]

  const noun = GLYPH_TO_NOUN.get(char)
  if (noun) return [{ name: noun, isText: false }]

  if (OVERWORLD_GLYPHS.has(char))
    return [{ name: toMarkerNoun(char), isText: false }]

  return [{ name: toFallbackGlyphNoun(char), isText: false }]
}

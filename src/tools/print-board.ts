import { OBJECT_GLYPHS, textCodeForName } from '../view/render-config.js'
import { renderRules } from '../view/render-helpers.js'
import { statusLine } from '../view/status-line.js'
import { sortRenderStack } from '../view/stack-policy.js'

import type { Direction, GameState, Item } from '../logic/types.js'

// Plain-text board printer for tooling (scripts/simulate.ts). Keeps the old
// terminal renderer's grid/rules/legend layout, without ANSI colors or the
// palette system — the simulate output was always stripped of escapes anyway.

const CELL_WIDTH = 2

const GRAPHEME_SEGMENTER = new Intl.Segmenter('en', {
  granularity: 'grapheme',
})

const toGraphemes = (value: string): string[] =>
  Array.from(GRAPHEME_SEGMENTER.segment(value), ({ segment }) => segment)

const isFullWidthCodePoint = (codePoint: number): boolean => {
  if (codePoint < 0x1100) return false

  return (
    codePoint <= 0x115f ||
    codePoint === 0x2329 ||
    codePoint === 0x232a ||
    (codePoint >= 0x2e80 && codePoint <= 0x3247 && codePoint !== 0x303f) ||
    (codePoint >= 0x3250 && codePoint <= 0x4dbf) ||
    (codePoint >= 0x4e00 && codePoint <= 0xa4c6) ||
    (codePoint >= 0xa960 && codePoint <= 0xa97c) ||
    (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
    (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
    (codePoint >= 0xfe10 && codePoint <= 0xfe19) ||
    (codePoint >= 0xfe30 && codePoint <= 0xfe6b) ||
    (codePoint >= 0xff01 && codePoint <= 0xff60) ||
    (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
    (codePoint >= 0x1b000 && codePoint <= 0x1b001) ||
    (codePoint >= 0x1f200 && codePoint <= 0x1f251) ||
    (codePoint >= 0x20000 && codePoint <= 0x3fffd)
  )
}

const graphemeWidth = (value: string): number => {
  if (/\p{Extended_Pictographic}/u.test(value)) return 2

  let width = 0
  for (const char of value) {
    const codePoint = char.codePointAt(0)
    if (!codePoint) continue

    if (
      codePoint === 0x200d ||
      (codePoint >= 0xfe00 && codePoint <= 0xfe0f) ||
      /\p{Mark}/u.test(char)
    )
      continue

    width += isFullWidthCodePoint(codePoint) ? 2 : 1
  }

  return width
}

const displayWidth = (value: string): number =>
  toGraphemes(value).reduce(
    (total, grapheme) => total + graphemeWidth(grapheme),
    0,
  )

const truncateToWidth = (value: string, maxWidth: number): string => {
  let width = 0
  let result = ''

  for (const grapheme of toGraphemes(value)) {
    const nextWidth = graphemeWidth(grapheme)
    if (width + nextWidth > maxWidth) break

    result += grapheme
    width += nextWidth
  }

  return result
}

const formatCell = (value: string): string => {
  const width = displayWidth(value)
  if (width === CELL_WIDTH) return value

  if (width > CELL_WIDTH) {
    const truncated = truncateToWidth(value, CELL_WIDTH)
    return truncated.padEnd(CELL_WIDTH, ' ')
  }

  return value.padEnd(value.length + (CELL_WIDTH - width), ' ')
}

const BELT_DIRECTION_GLYPHS: Record<Direction, string> = {
  up: '⬆️',
  right: '➡️',
  down: '⬇️',
  left: '⬅️',
}

const SUBWORLD_ICON_GLYPHS: Record<string, string> = {
  fall: '🍂',
  forest: '🌲',
  island: '🏝️',
  lake: '🌊',
  ruins: '🏛️',
  space: '🚀',
}

const levelIconGlyph = (item: Item): string => {
  const target = item.levelTarget
  if (!target) return '🔳'
  switch (target.kind) {
    case 'number':
      return `${target.n}`
    case 'letter':
      return target.c.toUpperCase()
    case 'extra':
      return `E${target.n}`
    case 'subworld':
      return SUBWORLD_ICON_GLYPHS[target.icon] ?? `W${target.n}`
    case 'parent':
      return '⌂'
  }
}

const glyphForItem = (item: Item): string | undefined => {
  if (item.name === 'cursor') return '👆'
  if (item.name === 'level' && !item.isText) return levelIconGlyph(item)
  if (item.name === 'belt') {
    const dir = item.dir ?? 'right'
    return BELT_DIRECTION_GLYPHS[dir]
  }

  return OBJECT_GLYPHS[item.name]
}

const glyphForLegendName = (name: string): string => {
  if (name === 'belt') return '⬆️➡️⬇️⬅️'
  return OBJECT_GLYPHS[name] ?? ''
}

const cellForItem = (item: Item): string =>
  formatCell(
    item.isText
      ? textCodeForName(item.name)
      : (glyphForItem(item) ?? textCodeForName(item.name)),
  )

const renderLegend = (maxWidth: number, names: Set<string>): string[] => {
  const entries = Array.from(names)
    .sort()
    .map((name) => {
      const code = textCodeForName(name)
      const glyph = glyphForLegendName(name)
      return `${code}=${name}${glyph}`
    })

  if (!entries.length) return ['(no text tiles)']

  const lines: string[] = []
  let current = ''

  for (const entry of entries) {
    const next = current ? `${current}  ${entry}` : entry
    if (displayWidth(next) > maxWidth && current) {
      lines.push(current)
      current = entry
    } else current = next
  }

  if (current) lines.push(current)

  return lines
}

export const printBoard = (state: GameState): string => {
  const grid = new Map<number, Item[]>()
  const textNames = new Set<string>()
  for (const item of state.items) {
    if (item.props.includes('hide')) continue

    const key = item.y * state.width + item.x
    const list = grid.get(key) ?? []
    list.push(item)
    grid.set(key, list)
    if (item.isText) textNames.add(item.name)
  }

  const rows: string[] = []
  for (let y = 0; y < state.height; y += 1) {
    let row = ''
    for (let x = 0; x < state.width; x += 1) {
      const list = grid.get(y * state.width + x) ?? []
      const top = sortRenderStack(list)[0]
      row += top ? cellForItem(top) : formatCell('.')
    }
    rows.push(row)
  }

  const ruleLines = renderRules(state.rules).map((line) => `  ${line}`)
  const legendLines = renderLegend(state.width * CELL_WIDTH, textNames)

  return [
    `Level ${state.levelIndex + 1}: ${state.title}`,
    statusLine(state.status),
    '',
    ...rows,
    '',
    'Rules:',
    ...ruleLines,
    '',
    'Legend:',
    ...legendLines,
  ].join('\n')
}

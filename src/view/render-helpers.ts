import {
  ANSI_IS,
  ANSI_RESET,
  ANSI_TEXT,
  OBJECT_GLYPHS,
  TEXT_CODES,
} from './render-config.js'
import { formatCell, measureDisplayWidth, stripAnsi } from './render-width.js'

import type { Direction, Item, Rule } from '../logic/types.js'

const BELT_DIRECTION_GLYPHS: Record<Direction, string> = {
  up: '⬆️',
  right: '➡️',
  down: '⬇️',
  left: '⬅️',
}

const MOVABLE_PROPS = new Set<Item['props'][number]>(['move', 'push', 'pull'])
const SYNTAX_WORDS = new Set(['is', 'and', 'not', 'has'])

const colorize = (value: string, color: string): string =>
  `${color}${value}${ANSI_RESET}`

const textColorForName = (name: string): string =>
  SYNTAX_WORDS.has(name) ? ANSI_IS : ANSI_TEXT

const glyphForItem = (item: Item): string | undefined => {
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

export const cellForItem = (item: Item): string => {
  if (item.isText) {
    const code = TEXT_CODES[item.name] ?? item.name.slice(0, 2).toUpperCase()
    const color = textColorForName(item.name)
    return colorize(formatCell(code), color)
  }

  const glyph = glyphForItem(item)
  if (glyph) return formatCell(glyph)

  const fallback = TEXT_CODES[item.name] ?? item.name.slice(0, 2).toUpperCase()
  return formatCell(fallback)
}

const isMovableItem = (item: Item): boolean =>
  !item.isText && item.props.some((prop) => MOVABLE_PROPS.has(prop))

const isInteractiveItem = (item: Item): boolean =>
  !item.isText &&
  item.props.some((prop) => prop !== 'you' && !MOVABLE_PROPS.has(prop))

const isNormalItem = (item: Item, textNames: Set<string>): boolean =>
  !item.isText && textNames.has(item.name)

const isDecorativeItem = (item: Item, textNames: Set<string>): boolean =>
  !item.isText && !textNames.has(item.name)

export const pickItem = (items: Item[], textNames: Set<string>): Item => {
  const youItem = items.find((item) => item.props.includes('you'))
  if (youItem) return youItem

  const textItem = items.find((item) => item.isText)
  if (textItem) return textItem

  const movableItem = items.find(isMovableItem)
  if (movableItem) return movableItem

  const interactiveItem = items.find(isInteractiveItem)
  if (interactiveItem) return interactiveItem

  const normalItem = items.find((item) => isNormalItem(item, textNames))
  if (normalItem) return normalItem

  const decorativeItem = items.find((item) => isDecorativeItem(item, textNames))
  if (decorativeItem) return decorativeItem

  const fallback = items[0]
  if (!fallback) throw new Error('No items available to render.')

  return fallback
}

export const renderRules = (rules: Rule[]): string[] => {
  if (!rules.length) return ['(no rules)']

  return rules
    .map((rule) => {
      const subject =
        `${rule.subjectNegated ? 'NOT ' : ''}${rule.subject}`.toUpperCase()
      const verb = rule.kind === 'has' ? 'HAS' : 'IS'
      const object =
        `${rule.objectNegated ? 'NOT ' : ''}${rule.object}`.toUpperCase()
      return `${subject} ${verb} ${object}`
    })
    .sort()
}

export const renderLegend = (
  maxWidth: number,
  names: Set<string>,
): string[] => {
  const entries = Array.from(names)
    .sort()
    .map((name) => {
      const code = TEXT_CODES[name] ?? name.slice(0, 2).toUpperCase()
      const color = textColorForName(name)
      const key = colorize(formatCell(code), color)
      const glyph = glyphForLegendName(name)
      return `${key}=${name}${glyph}`
    })

  if (!entries.length) return ['(no text tiles)']

  const lines: string[] = []
  let current = ''

  for (const entry of entries) {
    const next = current ? `${current}  ${entry}` : entry
    if (measureDisplayWidth(stripAnsi(next)) > maxWidth && current) {
      lines.push(current)
      current = entry
    } else current = next
  }

  if (current) lines.push(current)

  return lines
}

import {
  ANSI_IS,
  ANSI_RESET,
  ANSI_TEXT,
  OBJECT_GLYPHS,
  TEXT_CODES,
} from './render-config.js'
import { formatCell, measureDisplayWidth, stripAnsi } from './render-width.js'

import type { Item, Rule } from '../logic/types.js'

const colorize = (value: string, color: string): string =>
  `${color}${value}${ANSI_RESET}`

export const cellForItem = (item: Item): string => {
  if (item.isText) {
    const code = TEXT_CODES[item.name] ?? item.name.slice(0, 2).toUpperCase()
    const color = item.name === 'is' ? ANSI_IS : ANSI_TEXT
    return colorize(formatCell(code), color)
  }

  const glyph = OBJECT_GLYPHS[item.name]
  if (glyph) return formatCell(glyph)

  const fallback = TEXT_CODES[item.name] ?? item.name.slice(0, 2).toUpperCase()
  return formatCell(fallback)
}

const hasMoverProp = (item: Item): boolean => {
  const props = item.props as readonly string[]
  return props.includes('move') || props.includes('pull')
}

export const pickItem = (items: Item[]): Item => {
  const moverItem = items.find((item) => !item.isText && hasMoverProp(item))
  if (moverItem) return moverItem

  const youItem = items.find((item) => item.props.includes('you'))
  if (youItem) return youItem

  const textItem = items.find((item) => item.isText)
  if (textItem) return textItem

  const nonText = items.find((item) => !item.isText)
  if (nonText) return nonText

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
      const color = name === 'is' ? ANSI_IS : ANSI_TEXT
      const key = colorize(formatCell(code), color)
      const glyph = OBJECT_GLYPHS[name] ?? ''
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

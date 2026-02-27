import {
  ANSI_IS,
  ANSI_RESET,
  ANSI_TEXT,
  OBJECT_GLYPHS,
  textCodeForName,
} from './render-config.js'
import { sortRenderStack } from './stack-policy.js'
import { SYNTAX_WORDS } from './syntax-words.js'
import { formatCell, measureDisplayWidth, stripAnsi } from './render-width.js'

import type { Direction, Item, Rule } from '../logic/types.js'

const BELT_DIRECTION_GLYPHS: Record<Direction, string> = {
  up: '⬆️',
  right: '➡️',
  down: '⬇️',
  left: '⬅️',
}

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
    const code = textCodeForName(item.name)
    const color = textColorForName(item.name)
    return colorize(formatCell(code), color)
  }

  const glyph = glyphForItem(item)
  if (glyph) return formatCell(glyph)

  const fallback = textCodeForName(item.name)
  return formatCell(fallback)
}

export const pickItem = (items: Item[]): Item => {
  const topItem = sortRenderStack(items)[0]
  if (!topItem) throw new Error('No items available to render.')
  return topItem
}

export const renderRules = (rules: Rule[]): string[] => {
  if (!rules.length) return ['(no rules)']

  return rules
    .map((rule) => {
      const subject =
        `${rule.subjectNegated ? 'NOT ' : ''}${rule.subject}`.toUpperCase()
      const condition = !rule.condition
        ? ''
        : rule.condition.kind === 'lonely'
          ? ` ${rule.condition.negated ? 'NOT ' : ''}LONELY`
          : ` ${rule.condition.kind.toUpperCase()} ${
              rule.condition.objectNegated ? 'NOT ' : ''
            }${rule.condition.object.toUpperCase()}`
      const verb =
        rule.kind === 'has'
          ? 'HAS'
          : rule.kind === 'make'
            ? 'MAKE'
          : rule.kind === 'eat'
              ? 'EAT'
              : rule.kind === 'write'
                ? 'WRITE'
              : 'IS'
      const object =
        `${rule.objectNegated ? 'NOT ' : ''}${rule.object}`.toUpperCase()
      return `${subject}${condition} ${verb} ${object}`
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
      const code = textCodeForName(name)
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

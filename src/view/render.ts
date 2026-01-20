import type { GameState, Item, Rule } from '../logic/types.js'

const CELL_WIDTH = 2
const ANSI_RESET = '\x1b[0m'
const ANSI_TEXT = '\x1b[36m'
const ANSI_IS = '\x1b[33m'

const OBJECT_GLYPHS: Record<string, string> = {
  baba: '🐑',
  flag: '🚩',
  wall: '🧱',
  rock: '🪨',
  water: '🌊',
  keke: '🐸',
  bug: '🐞',
  door: '🚪',
  key: '🔑',
  flower: '🌸',
  grass: '🌿',
  moon: '🌙',
  star: '⭐',
  tree: '🌳',
  belt: '🧵',
}

const TEXT_CODES: Record<string, string> = {
  baba: 'BA',
  flag: 'FL',
  wall: 'WA',
  rock: 'RO',
  water: 'WT',
  keke: 'KE',
  bug: 'BU',
  door: 'DO',
  key: 'KY',
  flower: 'FW',
  grass: 'GR',
  moon: 'MO',
  star: 'SR',
  tree: 'TR',
  belt: 'BE',
  text: 'TX',
  is: 'IS',
  you: 'YO',
  win: 'WI',
  stop: 'SP',
  push: 'PU',
  defeat: 'DE',
  sink: 'SI',
  hot: 'HO',
  melt: 'ME',
}

const formatCell = (value: string): string => {
  if (value.length >= CELL_WIDTH) return value.slice(0, CELL_WIDTH)

  return value.padEnd(CELL_WIDTH, ' ')
}

const colorize = (value: string, color: string): string =>
  `${color}${value}${ANSI_RESET}`

const stripAnsi = (value: string): string =>
  value.replace(/\x1b\[[0-9;]*m/g, '')

const cellForItem = (item: Item): string => {
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

const pickItem = (items: Item[]): Item => {
  const youItem = items.find((item) => item.props.includes('you'))
  if (youItem) return youItem

  const nonText = items.find((item) => !item.isText)
  if (nonText) return nonText

  const fallback = items[0]
  if (!fallback) throw new Error('No items available to render.')

  return fallback
}

const renderRules = (rules: Rule[]): string[] => {
  if (!rules.length) return ['(no rules)']

  const lines = rules
    .map(
      (rule) => `${rule.subject.toUpperCase()} IS ${rule.object.toUpperCase()}`,
    )
    .sort()

  return lines
}

const renderLegend = (maxWidth: number, names: Set<string>): string[] => {
  const entries = Array.from(names)
    .sort()
    .map((name) => {
      const code = TEXT_CODES[name] ?? name.slice(0, 2).toUpperCase()
      const color = name === 'is' ? ANSI_IS : ANSI_TEXT
      const key = colorize(formatCell(code), color)
      return `${key}=${name}`
    })

  if (!entries.length) return ['(no text tiles)']

  const lines: string[] = []
  let current = ''

  for (const entry of entries) {
    const next = current ? `${current}  ${entry}` : entry
    if (stripAnsi(next).length > maxWidth && current) {
      lines.push(current)
      current = entry
    } else current = next
  }

  if (current) lines.push(current)

  return lines
}

export const render = (state: GameState): string => {
  const grid = new Map<number, Item[]>()
  const textNames = new Set<string>()
  for (const item of state.items) {
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
      if (!list.length) {
        row += formatCell('.')
        continue
      }
      row += cellForItem(pickItem(list))
    }
    rows.push(row)
  }

  const statusLine =
    state.status === 'win'
      ? 'WIN! Press N/Enter for next level.'
      : state.status === 'complete'
        ? 'ALL LEVELS CLEARED! Press N to restart.'
        : 'WASD/Arrows move, U=Undo, R=Restart, Q=Quit'

  const ruleLines = renderRules(state.rules).map((line) => `  ${line}`)
  const legendLines = renderLegend(state.width * CELL_WIDTH, textNames)

  return [
    `Level ${state.levelIndex + 1}: ${state.title}`,
    statusLine,
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

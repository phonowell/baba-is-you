import type { GameState, Item, Rule } from '../logic/types.js'

const CELL_WIDTH = 2
const ANSI_RESET = '\x1b[0m'
const ANSI_TEXT = '\x1b[36m'
const ANSI_IS = '\x1b[33m'
const GRAPHEME_SEGMENTER = new Intl.Segmenter('en', { granularity: 'grapheme' })

const OBJECT_GLYPHS: Record<string, string> = {
  algae: '🪸',
  baba: '🐑',
  brick: '🟧',
  crab: '🦀',
  ice: '🧊',
  jelly: '🍮',
  flag: '🚩',
  lava: '🌋',
  wall: '🧱',
  rock: '🪨',
  seastar: '⭐',
  skull: '💀',
  tile: '🟫',
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
  move: 'MV',
  open: 'OP',
  shut: 'SH',
  float: 'FT',
  tele: 'TL',
  pull: 'PL',
  shift: 'SF',
  swap: 'SW',
  up: 'UP',
  right: 'RT',
  down: 'DN',
  left: 'LF',
  and: 'AN',
  has: 'HA',
  not: 'NO',
  empty: 'EM',
  red: 'RD',
  blue: 'BL',
  best: 'BS',
  defeat: 'DE',
  sink: 'SI',
  hot: 'HO',
  melt: 'ME',
  weak: 'WK',
}

const stripAnsi = (value: string): string =>
  value.replace(/\x1b\[[0-9;]*m/g, '')

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
  toGraphemes(value).reduce((total, grapheme) => total + graphemeWidth(grapheme), 0)

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

const colorize = (value: string, color: string): string =>
  `${color}${value}${ANSI_RESET}`

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

const hasMoverProp = (item: Item): boolean => {
  const props = item.props as readonly string[]
  return props.includes('move') || props.includes('pull')
}

const pickItem = (items: Item[]): Item => {
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

const renderRules = (rules: Rule[]): string[] => {
  if (!rules.length) return ['(no rules)']

  const lines = rules
    .map((rule) => {
      const subject = `${rule.subjectNegated ? 'NOT ' : ''}${rule.subject}`.toUpperCase()
      const verb = rule.kind === 'has' ? 'HAS' : 'IS'
      const object = `${rule.objectNegated ? 'NOT ' : ''}${rule.object}`.toUpperCase()
      return `${subject} ${verb} ${object}`
    })
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
      const glyph = OBJECT_GLYPHS[name] ?? ''
      return `${key}=${name}${glyph}`
    })

  if (!entries.length) return ['(no text tiles)']

  const lines: string[] = []
  let current = ''

  for (const entry of entries) {
    const next = current ? `${current}  ${entry}` : entry
    if (displayWidth(stripAnsi(next)) > maxWidth && current) {
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
      : state.status === 'lose'
        ? 'DEFEAT! Press R to restart, Q to menu.'
      : state.status === 'complete'
        ? 'ALL LEVELS CLEARED! Press N to restart.'
        : 'WASD/Arrows move, U=Undo, R=Restart, Q=Menu'

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

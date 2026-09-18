import type {
  Direction,
  LevelData,
  LevelItem,
  LevelMeta,
  LevelName,
} from './types.js'

// ASCII level format ported from the predecessor Rust project (`../baba`).
//
// Layout:
//   <metadata lines `key = value`, single-char keys are legend entries>
//   ---
//   <map layer>
//   ---
//   <another map layer, merged cell-wise onto the previous ones>
//
// Legend values:
//   `b = baba`            object abbreviation
//   `o = "win" on water`  stacked cell, bottom-to-top after `on` split
//   `r = rocket up`       object with initial direction
//   `l = map 1 lake`      overworld entry: Level icon for subworld 1
//
// Uppercase glyphs produce the text entity of the legend noun.
// Bare glyph table covers property/operator text, `line` ground, and
// level-icon glyphs: `0`-`9`/`𝟎`-`𝟗` number levels, `𝟙`-`𝟞` extras,
// `𝔸`-`𝔼` letter levels, `•` the parent-map return icon.
//
// Metadata lines: `palette = name`, `background = a b`,
// `+ <glyphs> = cx,cy` object color overrides and
// `+ "<glyphs>" = ix,iy,ax,ay` text color overrides ([inactive, active]) —
// all resolved through the legend into LevelData.meta.

const PROPERTY_GLYPHS: Record<string, string> = {
  '✥': 'you',
  '⊘': 'stop',
  '↦': 'push',
  '✓': 'win',
  '≉': 'sink',
  '⩍': 'defeat',
  '⌇': 'hot',
  '⌢': 'melt',
  '→': 'move',
  '⨶': 'shut',
  '⧜': 'open',
  '⚲': 'float',
  '_': 'weak',
  '*': 'tele',
  '↣': 'pull',
  '^': 'shift',
  '↔': 'swap',
  '⇧': 'up',
  '⇩': 'down',
  '⇨': 'right',
  '⇦': 'left',
}

const OPERATOR_GLYPHS: Record<string, string> = {
  '=': 'is',
  '¬': 'not',
  '&': 'and',
  '~': 'has',
  '@': 'text',
  '?': 'empty',
}

const LINE_GLYPH = '.'

const LEVEL_GLYPHS: Record<string, LevelName> = {
  '•': { kind: 'parent' },
  ...Object.fromEntries(
    Array.from({ length: 10 }, (_, i) => [
      String(i),
      { kind: 'number', n: i } as LevelName,
    ]),
  ),
  // monospace digits 𝟎-𝟗 = levels 10-19
  ...Object.fromEntries(
    Array.from({ length: 10 }, (_, i) => [
      String.fromCodePoint(0x1d7ce + i),
      { kind: 'number', n: i + 10 } as LevelName,
    ]),
  ),
  // double-struck digits 𝟙-𝟞 = extra levels 1-6
  ...Object.fromEntries(
    Array.from({ length: 6 }, (_, i) => [
      String.fromCodePoint(0x1d7d9 + i),
      { kind: 'extra', n: i + 1 } as LevelName,
    ]),
  ),
  // double-struck letters are not contiguous (ℂ lives in letterlike)
  ...Object.fromEntries(
    [0x1d538, 0x1d539, 0x2102, 0x1d53b, 0x1d53c].map((cp, i) => [
      String.fromCodePoint(cp),
      { kind: 'letter', c: 'abcde'[i] ?? 'a' } as LevelName,
    ]),
  ),
}

// Stable key for color overrides and map rendering of `level` entities.
export const levelNameKey = (target: LevelName): string => {
  switch (target.kind) {
    case 'number':
      return `n${target.n}`
    case 'letter':
      return `l${target.c}`
    case 'extra':
      return `x${target.n}`
    case 'subworld':
      return `s${target.n}:${target.icon}`
    case 'parent':
      return 'parent'
  }
}

export const overrideKeyFor = (
  name: string,
  levelTarget?: LevelName,
): string => (levelTarget ? `level:${levelNameKey(levelTarget)}` : name)

type CellPart = {
  name: string
  isText: boolean
  dir?: Direction
  levelTarget?: LevelName
}

type CellSpec =
  | { kind: 'abbrev'; name: string }
  | { kind: 'full'; items: CellPart[] }
  | { kind: 'unsupported'; what: string }

const DIRECTION_WORDS = new Set(['up', 'right', 'down', 'left'])

const parseCellPart = (part: string): CellPart | 'unsupported' => {
  const tokens = part.trim().split(/\s+/)
  const head = tokens[0] ?? ''
  if (head === 'map') {
    const n = Number(tokens[1])
    const icon = tokens[2]
    if (!Number.isInteger(n) || !icon) return 'unsupported'
    return {
      name: 'level',
      isText: false,
      levelTarget: { kind: 'subworld', n, icon },
    }
  }
  if (head.startsWith('"') && head.endsWith('"') && head.length > 1) {
    return { name: head.slice(1, -1), isText: true }
  }
  const dirToken = tokens[1]
  const dir =
    dirToken && DIRECTION_WORDS.has(dirToken)
      ? (dirToken as Direction)
      : undefined
  return { name: head, isText: false, ...(dir ? { dir } : {}) }
}

const parseLegendSpec = (spec: string): CellSpec => {
  const trimmed = spec.trim()
  if (!/\s|"/.test(trimmed)) return { kind: 'abbrev', name: trimmed }

  const parts = trimmed.split(' on ').reverse()
  const items: CellPart[] = []
  for (const part of parts) {
    const parsed = parseCellPart(part)
    if (parsed === 'unsupported')
      return { kind: 'unsupported', what: trimmed }
    items.push(parsed)
  }
  return { kind: 'full', items }
}

const isUpperCaseChar = (char: string): boolean =>
  char.toLowerCase() !== char

const titleFromSource = (source: string): string => {
  const file = source.split('/').pop() ?? source
  const base = file.replace(/\.[^./]*$/, '')
  const stripped = base.replace(/^(?:\d+|extra-\d+|[a-z])-/, '')
  return (stripped || base).replace(/-/g, ' ').toUpperCase()
}

export const parseAsciiLevel = (
  levelText: string,
  source = '',
): LevelData => {
  const rawLines = levelText.split('\n').map((line) => line.replace(/\r$/, ''))
  if (rawLines[rawLines.length - 1] === '') rawLines.pop()
  const lines = rawLines

  const metaLines: string[] = []
  let cursor = 0
  while (cursor < lines.length && lines[cursor] !== '---' && lines[cursor] !== '+++') {
    metaLines.push(lines[cursor] ?? '')
    cursor += 1
  }
  cursor += 1 // skip the first --- separator

  let title: string | undefined
  let rightPad = 0
  const legend = new Map<string, CellSpec>()
  const meta: LevelMeta = {
    palette: 'default',
    backgrounds: [],
    colorOverrides: {},
    textColorOverrides: {},
  }
  const overrideLines: Array<{ key: string; value: string }> = []

  for (const metaLine of metaLines) {
    const trimmed = metaLine.trim()
    if (!trimmed) continue
    const eq = trimmed.indexOf(' = ')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq)
    const value = trimmed.slice(eq + 3)
    if (key.startsWith('+')) {
      overrideLines.push({ key, value })
      continue
    }
    if (key === 'right pad') {
      rightPad = Number(value) || 0
      continue
    }
    if (key === 'title') {
      title = value.trim() || undefined
      continue
    }
    if (key === 'palette') {
      meta.palette = value.trim() || 'default'
      continue
    }
    if (key === 'background') {
      meta.backgrounds = value.trim().split(/\s+/).filter(Boolean)
      continue
    }
    if ([...key].length === 1) {
      legend.set(key, parseLegendSpec(value))
    }
  }

  const bodyLines = lines.slice(cursor)
  const layers: string[][] = [[]]
  for (const line of bodyLines) {
    if (line === '---' || line === '+++') {
      layers.push([])
      continue
    }
    layers[layers.length - 1]?.push(line)
  }

  const width =
    layers.reduce(
      (max, layer) =>
        layer.reduce((m, line) => Math.max(m, [...line].length), max),
      0,
    ) + rightPad
  const height = layers.reduce((max, layer) => Math.max(max, layer.length), 0)

  const items: LevelItem[] = []
  let nextId = 1
  const pushItem = (x: number, y: number, part: CellPart): void => {
    items.push({
      id: nextId,
      name: part.name,
      x,
      y,
      isText: part.isText,
      ...(part.dir ? { dir: part.dir } : {}),
      ...(part.levelTarget ? { levelTarget: part.levelTarget } : {}),
    })
    nextId += 1
  }

  const cellPartsFor = (char: string): CellPart[] => {
    const spec = legend.get(char.toLowerCase())
    if (spec) {
      if (spec.kind === 'unsupported')
        throw new Error(`Unsupported legend entry '${char} = ${spec.what}' in ${source || 'level'}`)
      if (spec.kind === 'abbrev') {
        return isUpperCaseChar(char)
          ? [{ name: spec.name, isText: true }]
          : [{ name: spec.name, isText: false }]
      }
      if (isUpperCaseChar(char)) {
        const top = spec.items[spec.items.length - 1]
        return top && !top.isText
          ? [{ name: top.name, isText: true }]
          : []
      }
      return spec.items.map((item) => ({ ...item }))
    }

    const propertyWord = PROPERTY_GLYPHS[char]
    if (propertyWord) return [{ name: propertyWord, isText: true }]
    const operatorWord = OPERATOR_GLYPHS[char]
    if (operatorWord) return [{ name: operatorWord, isText: true }]
    if (char === LINE_GLYPH) return [{ name: 'line', isText: false }]
    const levelTarget = LEVEL_GLYPHS[char]
    if (levelTarget)
      return [{ name: 'level', isText: false, levelTarget }]
    return []
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      for (const layer of layers) {
        const char = [...(layer[y] ?? '')][x]
        if (char === undefined || char === ' ') continue
        for (const part of cellPartsFor(char)) {
          pushItem(x, y, part)
        }
      }
    }
  }

  // `+ glyphs = cx,cy` object color overrides, `+ "glyphs" = ix,iy ax,ay`
  // text color overrides ([inactive, active] — also written `i,i,a,a` in a
  // single comma run) — each glyph resolves through cellPartsFor to a
  // noun/level entity, same as the predecessor.
  for (const { key, value } of overrideLines) {
    const quoted = key.includes('"')
    const pairs: number[][] = []
    let malformed = false
    for (const token of value.trim().split(/\s+/)) {
      const nums = token.split(',').map((n) => Number(n.trim()))
      if (nums.length === 4) pairs.push(nums.slice(0, 2), nums.slice(2))
      else if (nums.length === 2) pairs.push(nums)
      else malformed = true
      if (nums.some((n) => !Number.isInteger(n) || n < 0)) malformed = true
    }
    if (malformed || pairs.length !== (quoted ? 2 : 1)) continue

    for (const glyph of key.slice(1).replaceAll('"', '').split(',')) {
      const char = glyph.trim()
      if (!char) continue
      const part = cellPartsFor(char)[0]
      if (!part || part.isText) continue
      const overrideKey = overrideKeyFor(part.name, part.levelTarget)
      if (quoted) {
        meta.textColorOverrides[overrideKey] = [
          [pairs[0]?.[0] ?? 0, pairs[0]?.[1] ?? 0],
          [pairs[1]?.[0] ?? 0, pairs[1]?.[1] ?? 0],
        ]
      } else {
        meta.colorOverrides[overrideKey] = [pairs[0]?.[0] ?? 0, pairs[0]?.[1] ?? 0]
      }
    }
  }

  const hasMeta =
    meta.palette !== 'default' ||
    meta.backgrounds.length > 0 ||
    Object.keys(meta.colorOverrides).length > 0 ||
    Object.keys(meta.textColorOverrides).length > 0

  return {
    title: title ?? titleFromSource(source),
    width,
    height,
    items,
    ...(hasMeta ? { meta } : {}),
  }
}

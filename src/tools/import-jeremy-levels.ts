#!/usr/bin/env tsx
import { promises as fs } from 'node:fs'
import path from 'node:path'

type ParsedItem = {
  dir?: 'up' | 'right' | 'down' | 'left'
  isText: boolean
  name: string
}

type LegendEntry = {
  items: ParsedItem[]
  topNoun: string | null
}

type PlacedItem = ParsedItem & {
  x: number
  y: number
}

type ConvertedLevel = {
  body: string
  source: string
}

type StopResult = {
  file: string
  reason: string
}

type MetaEntry = {
  key: string
  value: string
}

const GLYPH_TO_TEXT = new Map<string, string>([
  ['✥', 'you'],
  ['⊘', 'stop'],
  ['↦', 'push'],
  ['✓', 'win'],
  ['≉', 'sink'],
  ['⩍', 'defeat'],
  ['⌇', 'hot'],
  ['⌢', 'melt'],
  ['=', 'is'],
  ['¬', 'not'],
  ['&', 'and'],
  ['~', 'has'],
  ['@', 'text'],
  ['?', 'empty'],
  ['→', 'move'],
  ['⨶', 'shut'],
  ['⧜', 'open'],
  ['⚲', 'float'],
  ['*', 'tele'],
  ['↣', 'pull'],
  ['^', 'shift'],
  ['↔', 'swap'],
  ['⇧', 'up'],
  ['⇩', 'down'],
  ['⇨', 'right'],
  ['⇦', 'left'],
])

const GLYPH_TO_NOUN = new Map<string, string>([['.', 'line']])

const OVERWORLD_GLYPHS = new Set<string>([
  '𝟙',
  '𝟚',
  '𝟛',
  '𝟜',
  '𝟝',
  '𝟞',
  '𝔸',
  '𝔹',
  'ℂ',
  '𝔻',
  '𝔼',
  '0',
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '𝟎',
  '𝟏',
  '𝟐',
  '𝟑',
  '𝟒',
  '𝟓',
  '𝟔',
  '𝟕',
  '𝟖',
  '𝟗',
  '•',
])

const parseLevelSortKey = (
  basename: string,
): [group: number, a: number, b: number, tail: string] => {
  const numeric = basename.match(/^(\d+)-(.+)$/)
  if (numeric) {
    const numberPart = numeric[1]
    const tailPart = numeric[2]
    if (numberPart && tailPart) return [0, Number(numberPart), 0, tailPart]
  }

  const letter = basename.match(/^([a-z])-(.+)$/)
  if (letter) {
    const charPart = letter[1]
    const tailPart = letter[2]
    if (charPart && tailPart) return [1, charPart.charCodeAt(0), 0, tailPart]
  }

  const extra = basename.match(/^extra-(\d+)-(.+)$/)
  if (extra) {
    const numberPart = extra[1]
    const tailPart = extra[2]
    if (numberPart && tailPart) return [2, Number(numberPart), 0, tailPart]
  }

  return [3, 0, 0, basename]
}

const compareSortKey = (a: string, b: string): number => {
  const ak = parseLevelSortKey(a)
  const bk = parseLevelSortKey(b)
  if (ak[0] !== bk[0]) return ak[0] - bk[0]
  if (ak[1] !== bk[1]) return ak[1] - bk[1]
  if (ak[2] !== bk[2]) return ak[2] - bk[2]
  return ak[3].localeCompare(bk[3])
}

const parseTopLevelSortKey = (
  basename: string,
): [group: number, n: number, tail: string] => {
  const m = basename.match(/^(\d+)-(.+)$/)
  if (!m) return [1, 0, basename]

  const numberPart = m[1]
  const tailPart = m[2]
  if (!numberPart || !tailPart) return [1, 0, basename]

  return [0, Number(numberPart), tailPart]
}

const compareTopLevel = (a: string, b: string): number => {
  const ak = parseTopLevelSortKey(a)
  const bk = parseTopLevelSortKey(b)
  if (ak[0] !== bk[0]) return ak[0] - bk[0]
  if (ak[1] !== bk[1]) return ak[1] - bk[1]
  return ak[2].localeCompare(bk[2])
}

const buildImportOrder = async (levelsRoot: string): Promise<string[]> => {
  const entries = await fs.readdir(levelsRoot, { withFileTypes: true })
  const topFiles = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => name.endsWith('.txt'))
    .sort(compareTopLevel)
  const dirs = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort(compareTopLevel)

  const ordered: string[] = topFiles
  for (const dir of dirs) {
    const dirPath = path.join(levelsRoot, dir)
    const files = (await fs.readdir(dirPath, { withFileTypes: true }))
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .filter((name) => name.endsWith('.txt'))
      .sort(compareSortKey)
    for (const name of files) ordered.push(path.join(dir, name))
  }

  return ordered
}

const parseDirection = (
  value: string | undefined,
): ParsedItem['dir'] | undefined => {
  if (!value) return undefined

  const lower = value.toLowerCase()
  if (lower === 'up' || lower === 'right' || lower === 'down' || lower === 'left')
    return lower

  return undefined
}

const parseLegendDescriptor = (raw: string): ParsedItem[] => {
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

const decodeChar = (
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

const parseMetaEntries = (metaLines: string[]): MetaEntry[] =>
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

const lastMetaNumber = (meta: MetaEntry[], key: string): number => {
  for (let i = meta.length - 1; i >= 0; i -= 1) {
    const entry = meta[i]
    if (!entry || entry.key !== key) continue

    const parsed = Number(entry.value)
    if (Number.isFinite(parsed)) return Math.max(0, parsed)
  }
  return 0
}

const parseMapLayers = (lines: string[], delimiterIndex: number): string[][] => {
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

  while (layers.length > 0) {
    const last = layers[layers.length - 1]
    if (!last || last.some((line) => line.length > 0)) break
    layers.pop()
  }

  if (!layers.length) return [[]]

  return layers.map((layer) => {
    const next = [...layer]
    while (next.length > 0) {
      const last = next[next.length - 1]
      if (last && last.length > 0) break
      next.pop()
    }
    return next
  })
}

const parseCoordinateList = (value: string): Array<{ x: number; y: number }> =>
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
    .filter((value): value is { x: number; y: number } => value !== null)

const parsePlusSymbols = (rawKey: string): string[] =>
  rawKey
    .slice(1)
    .split(',')
    .map((token) => token.trim())
    .filter((token) => token.length > 0)

const toTitle = (relativePath: string): string => {
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

const toPlacedStatementKey = (item: PlacedItem): string => {
  const base = toStatementKey(item)
  if (item.isText || !item.dir) return base
  return `${base}@${item.dir}`
}

const getTopNoun = (items: ParsedItem[]): string | null => {
  for (let i = items.length - 1; i >= 0; i -= 1) {
    const item = items[i]
    if (!item || item.isText) continue
    return item.name
  }
  return null
}

const convertOneLevel = async (
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

  for (const layer of layers)
    for (let y = 0; y < layer.length; y += 1) {
      const line = layer[y] ?? ''
      const chars = Array.from(line)
      for (let x = 0; x < chars.length; x += 1) {
        const char = chars[x]
        if (!char) continue
        const decoded = decodeChar(char, legend)
        for (const item of decoded)
          placed.push({
            ...item,
            x: x + leftPad,
            y: y + topPad,
          })
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
      for (const coord of coordinates)
        for (const item of items)
          placed.push({
            ...item,
            x: coord.x + leftPad,
            y: coord.y + topPad,
          })
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

const renderLevelsTs = (levels: ConvertedLevel[]): string => {
  const blocks = levels.map((level) => `  \`\n${level.body}\n\`,`).join('\n')
  return `export const levels = [\n${blocks}\n] as const\n`
}

type LevelChunk = {
  key: string
  levels: ConvertedLevel[]
}

const toChunkKey = (source: string): string => {
  const normalized = source.replace(/\\/g, '/')
  const firstSegment = normalized.split('/')[0]
  if (!firstSegment || firstSegment.endsWith('.txt')) return 'root'

  return firstSegment
}

const toChunkSlug = (key: string): string =>
  key
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'chunk'

const groupLevels = (levels: ConvertedLevel[]): LevelChunk[] => {
  const grouped = new Map<string, ConvertedLevel[]>()
  for (const level of levels) {
    const key = toChunkKey(level.source)
    const list = grouped.get(key) ?? []
    list.push(level)
    grouped.set(key, list)
  }

  return Array.from(grouped.entries()).map(([key, chunkLevels]) => ({
    key,
    levels: chunkLevels,
  }))
}

const renderLevelsIndex = (
  chunkSpecs: Array<{ importPath: string; identifier: string }>,
): string => {
  const imports = chunkSpecs
    .map(
      (chunk) =>
        `import { levels as ${chunk.identifier} } from '${chunk.importPath}'`,
    )
    .join('\n')
  const spreads = chunkSpecs.map((chunk) => `  ...${chunk.identifier},`).join('\n')

  return `${imports}\n\nexport const levels = [\n${spreads}\n] as const\n`
}

const main = async (): Promise<void> => {
  const cwd = process.cwd()
  const levelsRoot = path.resolve(cwd, '..', 'baba', 'levels')
  const outputFile = path.resolve(cwd, 'src', 'levels.ts')
  const outputDir = path.resolve(cwd, 'src', 'levels-data')
  const ordered = await buildImportOrder(levelsRoot)

  if (!ordered.length) throw new Error(`No level files found in ${levelsRoot}`)

  const converted: ConvertedLevel[] = []
  let stop: StopResult | null = null

  for (const relFile of ordered) {
    const absFile = path.join(levelsRoot, relFile)
    const result = await convertOneLevel(absFile, relFile)
    if (result.stop) {
      stop = result.stop
      break
    }
    converted.push(result.level)
  }

  if (!converted.length) {
    const reason = stop?.reason ?? 'no level converted'
    throw new Error(`Import aborted before first level: ${reason}`)
  }

  const chunks = groupLevels(converted)
  if (!chunks.length) throw new Error('No level chunk generated')

  await fs.rm(outputDir, { recursive: true, force: true })
  await fs.mkdir(outputDir, { recursive: true })

  const chunkSpecs: Array<{ importPath: string; identifier: string }> = []
  for (let i = 0; i < chunks.length; i += 1) {
    const chunk = chunks[i]
    if (!chunk) continue
    const index = String(i).padStart(2, '0')
    const fileName = `${index}-${toChunkSlug(chunk.key)}.ts`
    const absPath = path.join(outputDir, fileName)
    await fs.writeFile(absPath, renderLevelsTs(chunk.levels), 'utf8')
    chunkSpecs.push({
      importPath: `./levels-data/${fileName.replace(/\.ts$/, '.js')}`,
      identifier: `levels_${index}`,
    })
  }

  await fs.writeFile(outputFile, renderLevelsIndex(chunkSpecs), 'utf8')

  console.log(
    `Imported ${converted.length} level(s) into src/levels.ts + ${chunkSpecs.length} chunk file(s)`,
  )
  console.log(
    `Last imported source: ${converted.at(-1)?.source ?? '(unknown)'}`,
  )
  if (stop) {
    console.log(`Stopped at: ${stop.file}`)
    console.log(`Reason: ${stop.reason}`)
  } else
    console.log('Completed all available levels without unsupported features.')
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(message)
  process.exit(1)
})

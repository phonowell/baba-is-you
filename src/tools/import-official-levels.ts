#!/usr/bin/env tsx
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import zlib from 'node:zlib'
import { parseLevel } from '../logic/parse-level.js'
import { createInitialState } from '../logic/state.js'

type Direction = 'up' | 'right' | 'down' | 'left'

type ParsedLayer = {
  width: number
  height: number
  main: Buffer
  data: Buffer | null
}

type LdData = {
  general: Map<string, string>
  currobjlist: Map<string, string>
  tiles: Map<string, string>
}

type TileDescriptor = {
  name: string
  isText: boolean
}

type ConvertedLevel = {
  body: string
  source: string
}

type InitialCapability = {
  hasYou: boolean
  hasWin: boolean
}

type TextTileCounts = {
  youTextCount: number
  winTextCount: number
  facingTextCount: number
}

type ConvertedLevelMeta = {
  titleRaw: string
  textTiles: TextTileCounts
}

type ConvertOneLevelResult = {
  level: ConvertedLevel
  unknownTileKeys: string[]
  meta: ConvertedLevelMeta
}

type ImportFilterReason =
  | 'missing-you'
  | 'missing-you_text-win_text'
  | 'many-facing_text'
  | 'unknown-card'
  | 'name-index'

type FilteredOutLevel = {
  fileName: string
  reasons: ImportFilterReason[]
  hasYou: boolean
  hasWin: boolean
  titleRaw: string
  textTiles: TextTileCounts
  unknownTileCount: number
}

type GlobalReference = {
  objectById: Map<
    string,
    {
      desc: TileDescriptor
      tileKey?: string
    }
  >
  tileCandidates: Map<string, Array<{ objectId: string; count: number }>>
}

type ParsedOfficialLevel = {
  fileName: string
  ld: LdData
  layers: ParsedLayer[]
}

type VerifySample = {
  fileName: string
  tileKey: string
  expected: string
  actual: string
}

type VerifyResult = {
  levels: number
  currobjTilePairs: number
  ambiguousCurrobjTiles: number
  tileMapMismatches: number
  usedTileTruthChecks: number
  usedTileTruthMismatches: number
  unknownTileKeys: string[]
  samples: VerifySample[]
}

const FACING_TEXT_FILTER_THRESHOLD = 5

const DEFAULT_OBJECT_ASSIGNMENTS: Record<number, string> = {
  0: 'baba',
  1: 'keke',
  2: 'rock',
  3: 'text_grass',
  4: 'tile',
  5: 'text_and',
  6: 'text_hide',
  7: 'text_follow',
  8: 'text_float',
  9: 'text_lonely',
  10: 'lava',
  11: 'water',
  12: 'wall',
  13: 'text_empty',
  14: 'text_tile',
  15: 'text_weak',
  16: 'text_near',
  17: 'cloud',
  18: 'pillar',
  19: 'text_fungus',
  20: 'text_baba',
  21: 'text_keke',
  22: 'text_flag',
  23: 'flag',
  24: 'ice',
  25: 'text_shift',
  26: 'rose',
  27: 'text_all',
  28: 'text_right',
  29: 'text_cloud',
  30: 'text_pillar',
  31: 'fungus',
  32: 'text_rock',
  33: 'text_lava',
  34: 'text_wall',
  35: 'text_ice',
  36: 'text_is',
  37: 'text_rose',
  38: 'text_more',
  39: 'text_safe',
  40: 'text_up',
  41: 'star',
  42: 'text_word',
  43: 'text_fruit',
  44: 'text_water',
  45: 'text_win',
  46: 'text_push',
  47: 'text_stop',
  48: 'text_move',
  49: 'text_best',
  50: 'text_tele',
  51: 'hand',
  52: 'text_left',
  53: 'text_star',
  54: 'text_red',
  55: 'fruit',
  56: 'text_melt',
  57: 'text_hot',
  58: 'text_you',
  59: 'text_not',
  60: 'text_sink',
  61: 'love',
  62: 'door',
  63: 'text_hand',
  64: 'text_down',
  65: 'dust',
  66: 'text_flower',
  67: 'text_tree',
  68: 'ghost',
  69: 'text_defeat',
  70: 'skull',
  71: 'grass',
  72: 'text_skull',
  73: 'text_love',
  74: 'text_door',
  75: 'text_text',
  76: 'text_sleep',
  77: 'text_dust',
  78: 'text_blue',
  79: 'tree',
  80: 'key',
  81: 'text_key',
  82: 'text_open',
  83: 'text_shut',
  84: 'text_has',
  85: 'box',
  86: 'text_box',
  87: 'belt',
  88: 'text_make',
  89: 'text_fall',
  90: 'flower',
  91: 'text_fence',
  92: 'text_belt',
  93: 'me',
  94: 'text_me',
  95: 'text_swap',
  96: 'text_pull',
  97: 'text_on',
  98: 'moon',
  99: 'text_ghost',
  100: 'fence',
  101: 'hedge',
  102: 'text_hedge',
  103: 'text_level',
  104: 'text_orb',
  105: 'orb',
  106: 'text_bonus',
  107: 'text_moon',
  108: 'text_group',
  109: 'text_line',
  110: 'brick',
  111: 'text_brick',
  112: 'text_wonder',
  113: 'text_eat',
  114: 'text_statue',
  115: 'statue',
  116: 'text_facing',
  117: 'line',
  118: 'text_fear',
  119: 'text_sad',
  120: 'text_robot',
  121: 'robot',
  150: 'cursor',
}

const renderLevelsTs = (levels: ConvertedLevel[]): string => {
  const blocks = levels.map((level) => `  \`\n${level.body}\n\`,`).join('\n')
  return `export const levels = [\n${blocks}\n] as const\n`
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

const readAscii = (
  buffer: Buffer,
  state: { offset: number },
  length: number,
): string => {
  const start = state.offset
  const end = start + length
  if (end > buffer.length) throw new Error('Unexpected EOF while reading ASCII')
  state.offset = end
  return buffer.toString('ascii', start, end)
}

const readU8 = (buffer: Buffer, state: { offset: number }): number => {
  const pos = state.offset
  if (pos + 1 > buffer.length) throw new Error('Unexpected EOF while reading u8')
  state.offset = pos + 1
  return buffer[pos] ?? 0
}

const readU16 = (buffer: Buffer, state: { offset: number }): number => {
  const pos = state.offset
  if (pos + 2 > buffer.length) throw new Error('Unexpected EOF while reading u16')
  state.offset = pos + 2
  return buffer.readUInt16LE(pos)
}

const readU32 = (buffer: Buffer, state: { offset: number }): number => {
  const pos = state.offset
  if (pos + 4 > buffer.length) throw new Error('Unexpected EOF while reading u32')
  state.offset = pos + 4
  return buffer.readUInt32LE(pos)
}

const readBytes = (
  buffer: Buffer,
  state: { offset: number },
  size: number,
): Buffer => {
  const start = state.offset
  const end = start + size
  if (end > buffer.length) throw new Error('Unexpected EOF while reading bytes')
  state.offset = end
  return buffer.subarray(start, end)
}

const parseLevelBinary = (buffer: Buffer): ParsedLayer[] => {
  const state = { offset: 0 }
  if (readAscii(buffer, state, 8) !== 'ACHTUNG!')
    throw new Error('Invalid .l magic')

  readU16(buffer, state)

  if (readAscii(buffer, state, 4) !== 'MAP ')
    throw new Error('Invalid .l MAP block tag')
  const mapLen = readU32(buffer, state)
  readBytes(buffer, state, mapLen)

  if (readAscii(buffer, state, 4) !== 'LAYR')
    throw new Error('Invalid .l LAYR block tag')
  const layrLen = readU32(buffer, state)
  const layrEnd = state.offset + layrLen
  if (layrEnd > buffer.length) throw new Error('Invalid .l LAYR block size')

  const layerCount = readU16(buffer, state)
  const layers: ParsedLayer[] = []
  for (let i = 0; i < layerCount; i += 1) {
    const width = readU32(buffer, state)
    const height = readU32(buffer, state)
    readBytes(buffer, state, 32)
    const subBlockCount = readU8(buffer, state)

    let main: Buffer | null = null
    let data: Buffer | null = null
    for (let s = 0; s < subBlockCount; s += 1) {
      const tag = readAscii(buffer, state, 4)
      if (tag === 'MAIN') {
        const compressedLen = readU32(buffer, state)
        const compressed = readBytes(buffer, state, compressedLen)
        main = zlib.inflateSync(compressed)
        continue
      }
      if (tag === 'DATA') {
        readU8(buffer, state)
        readU32(buffer, state)
        const compressedLen = readU32(buffer, state)
        const compressed = readBytes(buffer, state, compressedLen)
        data = zlib.inflateSync(compressed)
        continue
      }
      throw new Error(`Unsupported layer sub-block: ${tag}`)
    }

    if (!main) throw new Error('Layer missing MAIN data')
    const expectedMainLen = width * height * 2
    if (main.length !== expectedMainLen)
      throw new Error(
        `MAIN size mismatch: expected=${expectedMainLen} actual=${main.length}`,
      )
    if (data && data.length !== width * height)
      throw new Error(
        `DATA size mismatch: expected=${width * height} actual=${data.length}`,
      )

    layers.push({ width, height, main, data })
  }

  state.offset = layrEnd
  return layers
}

const parseLd = (source: string): LdData => {
  const general = new Map<string, string>()
  const currobjlist = new Map<string, string>()
  const tiles = new Map<string, string>()
  let section = ''
  for (const rawLine of source.replace(/\r\n/g, '\n').split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith(';') || line.startsWith('#')) continue
    const sectionMatch = line.match(/^\[([^\]]+)\]$/)
    if (sectionMatch) {
      section = sectionMatch[1]?.toLowerCase() ?? ''
      continue
    }
    const splitAt = line.indexOf('=')
    if (splitAt < 0) continue
    const key = line.slice(0, splitAt).trim()
    const value = line.slice(splitAt + 1).trim()
    if (!key) continue
    if (section === 'general') {
      general.set(key, value)
      continue
    }
    if (section === 'currobjlist') {
      currobjlist.set(key, value)
      continue
    }
    if (section === 'tiles') {
      tiles.set(key, value)
      continue
    }
  }
  return { general, currobjlist, tiles }
}

const parseTileKey = (raw: string | undefined): string | null => {
  if (!raw) return null
  const match = raw.match(/^(\d+),(\d+)$/)
  if (!match) return null
  return `${match[1]},${match[2]}`
}

const parseDirection = (value: number | undefined): Direction | undefined => {
  if (value === 0) return 'right'
  if (value === 1) return 'up'
  if (value === 2) return 'left'
  if (value === 3) return 'down'
  return undefined
}

const toTileKey = (x: number, y: number): string => `${x},${y}`

const objectIdToTileKey = (objectId: number): string => {
  const shifted = objectId + 1
  return `${shifted % 12},${Math.floor(shifted / 12)}`
}

const tileKeyToObjectId = (tileKey: string): number | null => {
  const parsed = parseTileKey(tileKey)
  if (!parsed) return null
  const [xRaw, yRaw] = parsed.split(',')
  if (!xRaw || !yRaw) return null
  const x = Number(xRaw)
  const y = Number(yRaw)
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  const objectId = y * 12 + x - 1
  return objectId >= 0 ? objectId : null
}

const normalizeRawName = (
  rawName: string,
  isTextHint: boolean,
): TileDescriptor => {
  let name = rawName.trim().toLowerCase()
  let isText = isTextHint
  if (name.startsWith('text_')) {
    name = name.slice(5)
    isText = true
  }
  if (name.startsWith('letter_')) {
    name = name.slice(7)
    isText = true
  }
  if (!name.length) name = 'unknown'
  return { name, isText }
}

const toStatementKey = (desc: TileDescriptor, dir?: Direction): string => {
  const base = desc.isText
    ? `${desc.name[0]?.toUpperCase() ?? ''}${desc.name.slice(1)}`
    : desc.name
  if (desc.isText || !dir) return base
  return `${base}@${dir}`
}

const parseCurrobjEntries = (
  ld: LdData,
): Array<{
  index: number
  name?: string
  objectId?: string
  tileKey?: string
}> => {
  const entries = new Map<
    number,
    {
      index: number
      name?: string
      objectId?: string
      tileKey?: string
    }
  >()
  for (const [key, value] of ld.currobjlist.entries()) {
    const match = key.match(/^(\d+)(name|object|tile)$/)
    if (!match) continue
    const index = Number(match[1])
    const field = match[2]
    if (!Number.isFinite(index)) continue
    const current = entries.get(index) ?? { index }
    if (field === 'name') current.name = value
    if (field === 'object') current.objectId = value
    if (field === 'tile') {
      const tileKey = parseTileKey(value)
      if (tileKey) current.tileKey = tileKey
    }
    entries.set(index, current)
  }
  return Array.from(entries.values())
}

const buildGlobalReference = (
  parsed: Array<{ fileName: string; ld: LdData }>,
): GlobalReference => {
  const nameCounts = new Map<string, Map<string, number>>()
  const textHintByName = new Map<string, TileDescriptor>()
  const tileByObjectCounts = new Map<string, Map<string, number>>()
  const tileCounts = new Map<string, Map<string, number>>()

  for (const level of parsed) {
    const changedNameObjects = new Set<string>()
    for (const key of level.ld.tiles.keys()) {
      const nameMatch = key.match(/^(object\d{3})_name$/)
      if (nameMatch?.[1]) changedNameObjects.add(nameMatch[1])
    }

    const entries = parseCurrobjEntries(level.ld)
    for (const entry of entries) {
      if (!entry.objectId || changedNameObjects.has(entry.objectId)) continue
      if (entry.name) {
        const desc = normalizeRawName(entry.name, false)
        const key = `${desc.name}:${desc.isText ? '1' : '0'}`
        const current = nameCounts.get(entry.objectId) ?? new Map<string, number>()
        current.set(key, (current.get(key) ?? 0) + 1)
        nameCounts.set(entry.objectId, current)
        textHintByName.set(key, desc)
      }
      if (entry.tileKey) {
        const objectTiles =
          tileByObjectCounts.get(entry.objectId) ?? new Map<string, number>()
        objectTiles.set(entry.tileKey, (objectTiles.get(entry.tileKey) ?? 0) + 1)
        tileByObjectCounts.set(entry.objectId, objectTiles)

        const current = tileCounts.get(entry.tileKey) ?? new Map<string, number>()
        current.set(entry.objectId, (current.get(entry.objectId) ?? 0) + 1)
        tileCounts.set(entry.tileKey, current)
      }
    }
  }

  const objectById = new Map<
    string,
    {
      desc: TileDescriptor
      tileKey?: string
    }
  >()
  for (const [objectId, names] of nameCounts.entries()) {
    const bestName = Array.from(names.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0]
    if (!bestName) continue
    const desc =
      textHintByName.get(bestName) ??
      ({
        name: 'unknown',
        isText: false,
      } satisfies TileDescriptor)

    const tileCountsForObject = tileByObjectCounts.get(objectId) ?? new Map<string, number>()
    const bestTile = Array.from(tileCountsForObject.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0]

    objectById.set(objectId, {
      desc,
      ...(bestTile ? { tileKey: bestTile } : {}),
    })
  }

  const tileCandidates = new Map<string, Array<{ objectId: string; count: number }>>()
  for (const [tileKey, counts] of tileCounts.entries()) {
    const sorted = Array.from(counts.entries())
      .map(([objectId, count]) => ({ objectId, count }))
      .sort((a, b) => b.count - a.count || a.objectId.localeCompare(b.objectId))
    tileCandidates.set(tileKey, sorted)
  }

  return { objectById, tileCandidates }
}

const buildLevelTileMap = (ld: LdData, global: GlobalReference): Map<string, TileDescriptor> => {
  const byObject = new Map<
    string,
    {
      desc: TileDescriptor
      tileKey?: string
      priority: number
    }
  >()

  for (const [objectId, meta] of global.objectById.entries()) {
    byObject.set(objectId, {
      desc: meta.desc,
      ...(meta.tileKey ? { tileKey: meta.tileKey } : {}),
      priority: 1,
    })
  }

  for (const [idRaw, assignment] of Object.entries(DEFAULT_OBJECT_ASSIGNMENTS)) {
    const id = Number(idRaw)
    if (!Number.isFinite(id) || !assignment) continue
    const objectId = `object${String(id).padStart(3, '0')}`
    const current = byObject.get(objectId)
    if (current) {
      if (!current.tileKey) current.tileKey = objectIdToTileKey(id)
      if (current.desc.name === 'unknown')
        current.desc = normalizeRawName(assignment, false)
      byObject.set(objectId, current)
      continue
    }
    byObject.set(objectId, {
      desc: normalizeRawName(assignment, false),
      tileKey: objectIdToTileKey(id),
      priority: 0,
    })
  }

  for (const [key, value] of ld.tiles.entries()) {
    const objectMatch = key.match(/^(object\d{3})_(name|unittype)$/)
    if (!objectMatch) continue
    const objectId = objectMatch[1] ?? ''
    const field = objectMatch[2]
    const current =
      byObject.get(objectId) ??
      ({
        desc: {
          name: 'unknown',
          isText: false,
        },
        priority: 0,
      } satisfies {
        desc: TileDescriptor
        tileKey?: string
        priority: number
      })
    if (field === 'name') {
      current.desc = normalizeRawName(value, current.desc.isText)
      current.priority = Math.max(current.priority, 2)
      byObject.set(objectId, current)
      continue
    }
    if (field === 'unittype') {
      const isText = current.desc.isText || value.toLowerCase() === 'text'
      current.desc = { ...current.desc, isText }
      current.priority = Math.max(current.priority, 2)
      byObject.set(objectId, current)
    }
  }

  for (const entry of parseCurrobjEntries(ld)) {
    if (!entry.objectId) continue
    const current =
      byObject.get(entry.objectId) ??
      ({
        desc: {
          name: 'unknown',
          isText: false,
        },
        priority: 0,
      } satisfies {
        desc: TileDescriptor
        tileKey?: string
        priority: number
      })
    if (entry.name) current.desc = normalizeRawName(entry.name, false)
    if (entry.tileKey) current.tileKey = entry.tileKey
    current.priority = Math.max(current.priority, 3)
    byObject.set(entry.objectId, current)
  }

  const map = new Map<string, { desc: TileDescriptor; priority: number }>()
  for (const [, meta] of byObject.entries()) {
    if (!meta.tileKey) continue
    const existing = map.get(meta.tileKey)
    if (!existing || meta.priority > existing.priority) {
      map.set(meta.tileKey, { desc: meta.desc, priority: meta.priority })
      continue
    }
    if (
      meta.priority === existing.priority &&
      existing.desc.name === 'unknown' &&
      meta.desc.name !== 'unknown'
    ) {
      map.set(meta.tileKey, { desc: meta.desc, priority: meta.priority })
    }
  }

  const resolved = new Map<string, TileDescriptor>()
  for (const [tileKey, meta] of map.entries()) resolved.set(tileKey, meta.desc)
  return resolved
}

const convertOneLevel = (
  fileName: string,
  ld: LdData,
  layers: ParsedLayer[],
  global: GlobalReference,
): ConvertOneLevelResult => {
  const firstLayer = layers[0]
  if (!firstLayer) throw new Error(`No layer found in ${fileName}`)
  const rawWidth = firstLayer.width
  const rawHeight = firstLayer.height
  const crop = rawWidth > 2 && rawHeight > 2
  const width = crop ? rawWidth - 2 : rawWidth
  const height = crop ? rawHeight - 2 : rawHeight
  const minX = crop ? 1 : 0
  const minY = crop ? 1 : 0
  const maxX = crop ? rawWidth - 2 : rawWidth - 1
  const maxY = crop ? rawHeight - 2 : rawHeight - 1

  const tileMap = buildLevelTileMap(ld, global)
  const grouped = new Map<string, Set<string>>()
  const unknownTiles = new Set<string>()
  let youTextCount = 0
  let winTextCount = 0
  let facingTextCount = 0

  for (const layer of layers) {
    if (layer.width !== rawWidth || layer.height !== rawHeight) continue
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const index = y * rawWidth + x
        const tileX = layer.main[index * 2] ?? 255
        const tileY = layer.main[index * 2 + 1] ?? 255
        if (tileX === 255 && tileY === 255) continue

        const tileKey = toTileKey(tileX, tileY)
        let resolved = tileMap.get(tileKey)
        if (!resolved) {
          const objectId = tileKeyToObjectId(tileKey)
          const assignment =
            objectId !== null ? DEFAULT_OBJECT_ASSIGNMENTS[objectId] : undefined
          if (assignment) resolved = normalizeRawName(assignment, false)
        }
        if (!resolved) {
          unknownTiles.add(tileKey)
          resolved = {
            name: `tile_${tileX}_${tileY}`,
            isText: false,
          } satisfies TileDescriptor
        }
        if (resolved.isText) {
          if (resolved.name === 'you') youTextCount += 1
          if (resolved.name === 'win') winTextCount += 1
          if (resolved.name === 'facing') facingTextCount += 1
        }

        const dataValue = layer.data?.[index]
        const dir = resolved.isText ? undefined : parseDirection(dataValue)
        const key = toStatementKey(resolved, dir)
        const xOut = x - minX
        const yOut = y - minY
        const coords = grouped.get(key) ?? new Set<string>()
        coords.add(`${xOut},${yOut}`)
        grouped.set(key, coords)
      }
    }
  }

  const titleRaw =
    ld.general.get('name') ??
    path.basename(fileName, '.l').replace(/level$/i, '')
  const title = titleRaw.toUpperCase()
  const lines = [
    `Title ${title};`,
    `Size ${width}x${height};`,
    'Background transparent;',
  ]

  const keys = Array.from(grouped.keys()).sort((a, b) => a.localeCompare(b))
  for (const key of keys) {
    const coords = grouped.get(key)
    if (!coords?.size) continue
    lines.push(`${key} ${Array.from(coords).join(' ')};`)
  }

  return {
    level: {
      source: fileName,
      body: lines.join('\n'),
    },
    unknownTileKeys: Array.from(unknownTiles).sort((a, b) =>
      a.localeCompare(b),
    ),
    meta: {
      titleRaw,
      textTiles: {
        youTextCount,
        winTextCount,
        facingTextCount,
      },
    },
  }
}

const parseSortKey = (
  fileName: string,
): { group: number; letter: string; num: number; raw: string } => {
  const base = path.basename(fileName)
  const numeric = base.match(/^(\d+)level\.l$/i)
  if (numeric)
    return {
      group: 0,
      letter: '',
      num: Number(numeric[1]),
      raw: base.toLowerCase(),
    }

  const prefixed = base.match(/^([a-z])(\d+)level\.l$/i)
  if (prefixed)
    return {
      group: 1,
      letter: prefixed[1]?.toLowerCase() ?? '',
      num: Number(prefixed[2]),
      raw: base.toLowerCase(),
    }

  return {
    group: 2,
    letter: '',
    num: Number.MAX_SAFE_INTEGER,
    raw: base.toLowerCase(),
  }
}

const byLevelFileOrder = (a: string, b: string): number => {
  const ak = parseSortKey(a)
  const bk = parseSortKey(b)
  if (ak.group !== bk.group) return ak.group - bk.group
  if (ak.letter !== bk.letter) return ak.letter.localeCompare(bk.letter)
  if (ak.num !== bk.num) return ak.num - bk.num
  return ak.raw.localeCompare(bk.raw)
}

const chunkLevels = (
  levels: ConvertedLevel[],
  chunkSize: number,
): ConvertedLevel[][] => {
  const chunks: ConvertedLevel[][] = []
  for (let i = 0; i < levels.length; i += chunkSize)
    chunks.push(levels.slice(i, i + chunkSize))
  return chunks
}

const checkInitialCapability = (level: ConvertedLevel): InitialCapability => {
  const parsedLevel = parseLevel(level.body)
  const initialState = createInitialState(parsedLevel, 0)
  return {
    hasYou: initialState.items.some((item) => item.props.includes('you')),
    hasWin: initialState.items.some((item) => item.props.includes('win')),
  }
}

const describeTile = (tile: TileDescriptor): string =>
  `${tile.isText ? 'text_' : ''}${tile.name}`

const tileEquals = (a: TileDescriptor, b: TileDescriptor): boolean =>
  a.name === b.name && a.isText === b.isText

const loadParsedOfficialLevels = async (
  sourceDir: string,
): Promise<ParsedOfficialLevel[]> => {
  const entries = await fs.readdir(sourceDir, { withFileTypes: true })
  const lFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.l'))
    .map((entry) => entry.name)
    .sort(byLevelFileOrder)
  if (!lFiles.length) throw new Error(`No .l file found in ${sourceDir}`)

  const parsed: ParsedOfficialLevel[] = []
  for (const fileName of lFiles) {
    const ldPath = path.join(sourceDir, fileName.replace(/\.l$/i, '.ld'))
    const [lBuffer, ldSource] = await Promise.all([
      fs.readFile(path.join(sourceDir, fileName)),
      fs.readFile(ldPath, 'utf8'),
    ])
    parsed.push({
      fileName,
      ld: parseLd(ldSource),
      layers: parseLevelBinary(lBuffer),
    })
  }
  return parsed
}

const verifyOfficialImportConsistency = (
  parsed: ParsedOfficialLevel[],
  global: GlobalReference,
): VerifyResult => {
  let currobjTilePairs = 0
  let ambiguousCurrobjTiles = 0
  let tileMapMismatches = 0
  let usedTileTruthChecks = 0
  let usedTileTruthMismatches = 0
  const samples: VerifySample[] = []
  const unknownTileCounts = new Map<string, number>()

  for (const level of parsed) {
    const tileMap = buildLevelTileMap(level.ld, global)
    const expectedByTile = new Map<string, TileDescriptor>()
    const ambiguous = new Set<string>()
    for (const entry of parseCurrobjEntries(level.ld)) {
      if (!entry.tileKey || !entry.name) continue
      currobjTilePairs += 1
      const expected = normalizeRawName(entry.name, false)
      const existing = expectedByTile.get(entry.tileKey)
      if (existing && !tileEquals(existing, expected)) {
        ambiguous.add(entry.tileKey)
        continue
      }
      expectedByTile.set(entry.tileKey, expected)
    }
    ambiguousCurrobjTiles += ambiguous.size

    for (const [tileKey, expected] of expectedByTile.entries()) {
      const actual = tileMap.get(tileKey)
      if (actual && tileEquals(actual, expected)) continue
      tileMapMismatches += 1
      if (samples.length < 30) {
        samples.push({
          fileName: level.fileName,
          tileKey,
          expected: describeTile(expected),
          actual: actual ? describeTile(actual) : '<missing>',
        })
      }
    }

    const firstLayer = level.layers[0]
    if (!firstLayer) continue
    const rawWidth = firstLayer.width
    const rawHeight = firstLayer.height
    const crop = rawWidth > 2 && rawHeight > 2
    const minX = crop ? 1 : 0
    const minY = crop ? 1 : 0
    const maxX = crop ? rawWidth - 2 : rawWidth - 1
    const maxY = crop ? rawHeight - 2 : rawHeight - 1

    for (const layer of level.layers) {
      if (layer.width !== rawWidth || layer.height !== rawHeight) continue
      for (let y = minY; y <= maxY; y += 1) {
        for (let x = minX; x <= maxX; x += 1) {
          const index = y * rawWidth + x
          const tileX = layer.main[index * 2] ?? 255
          const tileY = layer.main[index * 2 + 1] ?? 255
          if (tileX === 255 && tileY === 255) continue
          const tileKey = toTileKey(tileX, tileY)
          const expected = expectedByTile.get(tileKey)
          if (expected) {
            usedTileTruthChecks += 1
            const actual = tileMap.get(tileKey)
            if (actual && tileEquals(actual, expected)) continue
            usedTileTruthMismatches += 1
          }
          const objectId = tileKeyToObjectId(tileKey)
          const fallback =
            objectId !== null ? DEFAULT_OBJECT_ASSIGNMENTS[objectId] : undefined
          if (!tileMap.get(tileKey) && !fallback) {
            unknownTileCounts.set(tileKey, (unknownTileCounts.get(tileKey) ?? 0) + 1)
          }
        }
      }
    }
  }

  const unknownTileKeys = Array.from(unknownTileCounts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([tileKey]) => tileKey)

  return {
    levels: parsed.length,
    currobjTilePairs,
    ambiguousCurrobjTiles,
    tileMapMismatches,
    usedTileTruthChecks,
    usedTileTruthMismatches,
    unknownTileKeys,
    samples,
  }
}

const main = async (): Promise<void> => {
  const cwd = process.cwd()
  const sourceDir = path.resolve(cwd, 'data', 'baba')
  const verifyOnly = process.argv.includes('--verify')
  const outputFile = path.resolve(cwd, 'src', 'levels.ts')
  const outputDir = path.resolve(cwd, 'src', 'levels-data')
  const parsed = await loadParsedOfficialLevels(sourceDir)
  const global = buildGlobalReference(parsed)
  if (verifyOnly) {
    const verify = verifyOfficialImportConsistency(parsed, global)
    console.log(`Verified levels: ${verify.levels}`)
    console.log(`Currobj tile pairs: ${verify.currobjTilePairs}`)
    console.log(`Ambiguous currobj tiles: ${verify.ambiguousCurrobjTiles}`)
    console.log(`Tile map mismatches: ${verify.tileMapMismatches}`)
    console.log(`Used tile truth checks: ${verify.usedTileTruthChecks}`)
    console.log(`Used tile truth mismatches: ${verify.usedTileTruthMismatches}`)
    console.log(`Unknown tile keys after crop: ${verify.unknownTileKeys.length}`)
    if (verify.samples.length) {
      for (const sample of verify.samples.slice(0, 20)) {
        console.log(
          `mismatch ${sample.fileName} ${sample.tileKey} expected=${sample.expected} actual=${sample.actual}`,
        )
      }
    }
    if (verify.unknownTileKeys.length) {
      console.log(`unknown keys: ${verify.unknownTileKeys.join(' ')}`)
    }
    if (
      verify.ambiguousCurrobjTiles > 0 ||
      verify.tileMapMismatches > 0 ||
      verify.usedTileTruthMismatches > 0
    ) {
      throw new Error('Official import consistency verification failed')
    }
    return
  }

  const converted: ConvertedLevel[] = []
  const filteredOut: FilteredOutLevel[] = []
  const filteredReasonCounts = new Map<ImportFilterReason, number>()
  const countFilteredReason = (reason: ImportFilterReason): void => {
    filteredReasonCounts.set(reason, (filteredReasonCounts.get(reason) ?? 0) + 1)
  }
  for (const current of parsed) {
    const { level, unknownTileKeys, meta } = convertOneLevel(
      current.fileName,
      current.ld,
      current.layers,
      global,
    )
    const { hasYou, hasWin } = checkInitialCapability(level)
    const reasons: ImportFilterReason[] = []
    if (!hasYou) reasons.push('missing-you')
    if (
      meta.textTiles.youTextCount === 0 &&
      meta.textTiles.winTextCount === 0
    )
      reasons.push('missing-you_text-win_text')
    if (meta.textTiles.facingTextCount >= FACING_TEXT_FILTER_THRESHOLD)
      reasons.push('many-facing_text')
    if (unknownTileKeys.length > 0) reasons.push('unknown-card')
    if (meta.titleRaw.trim().toLowerCase() === 'index') reasons.push('name-index')
    if (reasons.length) {
      for (const reason of reasons) countFilteredReason(reason)
      filteredOut.push({
        fileName: current.fileName,
        reasons,
        hasYou,
        hasWin,
        titleRaw: meta.titleRaw,
        textTiles: meta.textTiles,
        unknownTileCount: unknownTileKeys.length,
      })
      continue
    }
    converted.push(level)
  }

  await fs.rm(outputDir, { recursive: true, force: true })
  await fs.mkdir(outputDir, { recursive: true })

  const chunks = chunkLevels(converted, 50)
  const chunkSpecs: Array<{ importPath: string; identifier: string }> = []
  for (let i = 0; i < chunks.length; i += 1) {
    const chunk = chunks[i]
    if (!chunk) continue
    const index = String(i).padStart(2, '0')
    const fileName = `${index}-official.ts`
    const absPath = path.join(outputDir, fileName)
    await fs.writeFile(absPath, renderLevelsTs(chunk), 'utf8')
    chunkSpecs.push({
      importPath: `./levels-data/${fileName.replace(/\.ts$/, '.js')}`,
      identifier: `levels_${index}`,
    })
  }

  await fs.writeFile(outputFile, renderLevelsIndex(chunkSpecs), 'utf8')

  console.log(`Imported official levels: ${converted.length}`)
  console.log(`Filtered levels: ${filteredOut.length}`)
  const reasonOrder: ImportFilterReason[] = [
    'missing-you',
    'missing-you_text-win_text',
    'many-facing_text',
    'unknown-card',
    'name-index',
  ]
  for (const reason of reasonOrder) {
    const count = filteredReasonCounts.get(reason) ?? 0
    console.log(`Filtered ${reason}: ${count}`)
  }
  const missingWinCount = converted
    .map((level) => checkInitialCapability(level))
    .filter((capability) => !capability.hasWin).length
  console.log(`Levels missing win (kept): ${missingWinCount}`)
  console.log(`Generated chunks: ${chunkSpecs.length}`)
  console.log('Unknown tile keys in kept levels: 0')
  if (filteredOut.length) {
    const preview = filteredOut.slice(0, 10)
    for (const level of preview) {
      console.log(
        `filtered ${level.fileName}: ${level.reasons.join(',')} you=${level.hasYou ? '1' : '0'} win=${level.hasWin ? '1' : '0'} you_text=${level.textTiles.youTextCount} win_text=${level.textTiles.winTextCount} facing_text=${level.textTiles.facingTextCount} unknown=${level.unknownTileCount} name=${level.titleRaw}`,
      )
    }
  }
}

const isDirectRun = (() => {
  const argvEntry = process.argv[1]
  if (!argvEntry) return false
  return pathToFileURL(path.resolve(argvEntry)).href === import.meta.url
})()

if (isDirectRun) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    console.error(message)
    process.exit(1)
  })
}

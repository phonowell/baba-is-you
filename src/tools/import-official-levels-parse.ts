import { VANILLA_OBJECT_TILES } from './import-official-levels-vanilla-tiles.js'

export type Direction = 'up' | 'right' | 'down' | 'left'

export type LdData = {
  general: Map<string, string>
  currobjlist: Map<string, string>
  tiles: Map<string, string>
  // Map-only sections (leveltype=1 files): level icons, path trails,
  // world icon sprite names, background images, and special markers.
  levels: Map<string, string>
  paths: Map<string, string>
  icons: Map<string, string>
  images: Map<string, string>
  specials: Map<string, string>
}

export type TileDescriptor = {
  name: string
  isText: boolean
}

export type CurrobjEntry = {
  index: number
  name?: string
  objectId?: string
  tileKey?: string
}

const LD_SECTIONS = [
  'general',
  'currobjlist',
  'tiles',
  'levels',
  'paths',
  'icons',
  'images',
  'specials',
] as const

export const parseLd = (source: string): LdData => {
  const data = Object.fromEntries(
    LD_SECTIONS.map((name) => [name, new Map<string, string>()]),
  ) as Record<(typeof LD_SECTIONS)[number], Map<string, string>>
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
    const target = data[section as keyof typeof data]
    if (target) target.set(key, value)
  }
  return data
}

export const parseTileKey = (raw: string | undefined): string | null => {
  if (!raw) return null
  const match = raw.match(/^(\d+),(\d+)$/)
  if (!match) return null
  return `${match[1]},${match[2]}`
}

export const parseDirection = (
  value: number | undefined,
): Direction | undefined => {
  if (value === 0) return 'right'
  if (value === 1) return 'up'
  if (value === 2) return 'left'
  if (value === 3) return 'down'
  return undefined
}

export const toTileKey = (x: number, y: number): string => `${x},${y}`

const TILE_KEY_TO_OBJECT_ID = new Map<string, number>(
  Object.entries(VANILLA_OBJECT_TILES).map(([id, tileKey]) => [
    tileKey,
    Number(id),
  ]),
)

export const objectIdToTileKey = (objectId: number): string | undefined =>
  VANILLA_OBJECT_TILES[objectId]

export const tileKeyToObjectId = (tileKey: string): number | null =>
  TILE_KEY_TO_OBJECT_ID.get(tileKey) ?? null

export const normalizeRawName = (
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

export const toStatementKey = (desc: TileDescriptor, dir?: Direction): string => {
  const base = desc.isText
    ? `${desc.name[0]?.toUpperCase() ?? ''}${desc.name.slice(1)}`
    : desc.name
  if (desc.isText || !dir) return base
  return `${base}@${dir}`
}

export const parseCurrobjEntries = (ld: LdData): CurrobjEntry[] => {
  const entries = new Map<number, CurrobjEntry>()
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

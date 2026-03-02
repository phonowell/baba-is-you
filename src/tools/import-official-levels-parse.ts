export type Direction = 'up' | 'right' | 'down' | 'left'

export type LdData = {
  general: Map<string, string>
  currobjlist: Map<string, string>
  tiles: Map<string, string>
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

export const parseLd = (source: string): LdData => {
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

export const objectIdToTileKey = (objectId: number): string => {
  const shifted = objectId + 1
  return `${shifted % 12},${Math.floor(shifted / 12)}`
}

export const tileKeyToObjectId = (tileKey: string): number | null => {
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

// Parses the official `tileslist` table out of values.lua — the canonical
// save-object registry (objectNNN -> name/sprite/tile/type/layer/colour).
// Levels may override per-slot fields via their [tiles] section; this table
// is the base those overrides sit on.
import { promises as fs } from 'node:fs'
import path from 'node:path'

export type CanonicalObject = {
  objectId: string
  name: string
  unittype: 'object' | 'text'
  /** Official syntax class: 0 noun, 1 verb, 2 property, 3 prefix cond,
   * 4 not, 5 letter, 6 and, 7 infix cond. */
  type: number
  /** Atlas position the slot occupies in the saved tile grid. */
  tileX: number
  tileY: number
  layer: number
  tiling: number
  colour: [number, number]
  active: [number, number] | undefined
}

export type CanonicalObjectTable = ReadonlyMap<string, CanonicalObject>

const FIELD_PATTERN =
  /(object\d{3})\s*=\s*\{(.*?)\n\t\},/gs

const readString = (block: string, field: string): string | undefined =>
  block.match(new RegExp(`${field} = "([^"]+)"`))?.[1]

const readInt = (block: string, field: string): number | undefined => {
  const raw = block.match(new RegExp(`[^_a-z]${field} = (-?\\d+)`))?.[1]
  return raw === undefined ? undefined : Number(raw)
}

const readPair = (
  block: string,
  field: string,
): [number, number] | undefined => {
  const m = block.match(new RegExp(`${field} = \\{(\\d+), (\\d+)\\}`))
  return m ? [Number(m[1]), Number(m[2])] : undefined
}

export const parseCanonicalObjects = (valuesLua: string): CanonicalObjectTable => {
  const tableStart = valuesLua.indexOf('tileslist =')
  if (tableStart < 0) throw new Error('values.lua: tileslist not found')
  const body = valuesLua.slice(tableStart)
  const out = new Map<string, CanonicalObject>()
  for (const match of body.matchAll(FIELD_PATTERN)) {
    const objectId = match[1]!
    const block = match[2]!
    const name = readString(block, 'name')
    const tile = readPair(block, 'tile')
    if (!name || !tile) continue
    out.set(objectId, {
      objectId,
      name,
      unittype: readString(block, 'unittype') === 'text' ? 'text' : 'object',
      type: readInt(block, 'type') ?? 0,
      tileX: tile[0],
      tileY: tile[1],
      layer: readInt(block, 'layer') ?? 10,
      tiling: readInt(block, 'tiling') ?? -1,
      colour: readPair(block, 'colour') ?? [0, 3],
      active: readPair(block, 'active'),
    })
  }
  if (out.size === 0) throw new Error('values.lua: tileslist parsed empty')
  return out
}

export const loadCanonicalObjects = async (
  dataRoot: string,
): Promise<CanonicalObjectTable> =>
  parseCanonicalObjects(
    await fs.readFile(path.join(dataRoot, 'values.lua'), 'utf8'),
  )

export const canonicalTileKey = (object: CanonicalObject): string =>
  `${object.tileX},${object.tileY}`

// Reverse lookup: atlas position -> object slot. `default` padding slots
// share positions with each other and must not shadow real objects.
const reverseMaps = new WeakMap<CanonicalObjectTable, Map<string, string>>()

export const canonicalObjectIdAt = (
  canon: CanonicalObjectTable,
  tileKey: string,
): string | undefined => {
  let reverse = reverseMaps.get(canon)
  if (!reverse) {
    reverse = new Map<string, string>()
    const defaults: string[] = []
    for (const [objectId, object] of canon) {
      const key = canonicalTileKey(object)
      if (object.name === 'default') {
        defaults.push(objectId)
        continue
      }
      if (!reverse.has(key)) reverse.set(key, objectId)
    }
    for (const objectId of defaults) {
      const object = canon.get(objectId)
      if (!object) continue
      const key = canonicalTileKey(object)
      if (!reverse.has(key)) reverse.set(key, objectId)
    }
    reverseMaps.set(canon, reverse)
  }
  return reverse.get(tileKey)
}

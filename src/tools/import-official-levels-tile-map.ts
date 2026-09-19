import {
  normalizeRawName,
  parseCurrobjEntries,
  toTileKey,
} from './import-official-levels-parse.js'

import type { CanonicalObjectTable } from './import-official-levels-object-table.js'
import type { LdData, TileDescriptor } from './import-official-levels-parse.js'
import type { GlobalReference } from './import-official-levels-global-reference.js'

// Save-format object slots (`objectNNN`) are positional: the slot's atlas
// tile comes from the canonical tileslist (old levels) or the currobj
// `Ntile=` field (newer saves), while the object it REPRESENTS comes from
// the level's [tiles] overrides first, then the canonical tileslist, and
// only then the currobjlist `Nname=` field — that name is editor palette
// metadata and goes stale when a level redefines a slot (e.g. 104level
// turns fungus/hand into cliff/rubble).
export const buildLevelTileMap = (
  ld: LdData,
  global: GlobalReference,
  canon: CanonicalObjectTable,
): Map<string, TileDescriptor> => {
  const currobjName = new Map<string, TileDescriptor>()
  const currobjTile = new Map<string, string>()
  for (const entry of parseCurrobjEntries(ld)) {
    if (!entry.objectId) continue
    if (entry.name && !currobjName.has(entry.objectId))
      currobjName.set(entry.objectId, normalizeRawName(entry.name, false))
    if (entry.tileKey && !currobjTile.has(entry.objectId))
      currobjTile.set(entry.objectId, entry.tileKey)
  }

  const objectIds = new Set<string>([
    ...canon.keys(),
    ...currobjName.keys(),
    ...currobjTile.keys(),
    ...global.objectById.keys(),
  ])
  for (const key of ld.tiles.keys()) {
    const objectId = key.match(/^(object\d{3})_name$/)?.[1]
    if (objectId) objectIds.add(objectId)
  }

  const descForObject = (objectId: string): TileDescriptor | undefined => {
    const overrideName = ld.tiles.get(`${objectId}_name`)
    if (overrideName) {
      return normalizeRawName(
        overrideName,
        ld.tiles.get(`${objectId}_unittype`) === 'text',
      )
    }
    const canonical = canon.get(objectId)
    // `default` slots are empty editor palette padding, not real objects —
    // a level that references one must supply the name itself.
    if (canonical && canonical.name !== 'default') {
      return normalizeRawName(canonical.name, canonical.unittype === 'text')
    }
    return (
      currobjName.get(objectId) ?? global.objectById.get(objectId)?.desc
    )
  }

  const tileForObject = (objectId: string): string | undefined => {
    const currobj = currobjTile.get(objectId)
    if (currobj) return currobj
    const canonical = canon.get(objectId)
    if (canonical) return toTileKey(canonical.tileX, canonical.tileY)
    return global.objectById.get(objectId)?.tileKey
  }

  const map = new Map<string, { desc: TileDescriptor; score: number }>()
  for (const objectId of objectIds) {
    const tileKey = tileForObject(objectId)
    const desc = descForObject(objectId)
    if (!tileKey || !desc) continue
    const score =
      (currobjTile.has(objectId) ? 2 : 0) +
      (ld.tiles.has(`${objectId}_name`) ? 1 : 0)
    const existing = map.get(tileKey)
    if (!existing || score > existing.score) {
      map.set(tileKey, { desc, score })
    }
  }

  const resolved = new Map<string, TileDescriptor>()
  for (const [tileKey, meta] of map.entries()) resolved.set(tileKey, meta.desc)
  return resolved
}

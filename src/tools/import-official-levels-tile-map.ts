import { DEFAULT_OBJECT_ASSIGNMENTS } from './import-official-levels-default-assignments.js'
import {
  normalizeRawName,
  objectIdToTileKey,
  parseCurrobjEntries,
} from './import-official-levels-parse.js'

import type { LdData, TileDescriptor } from './import-official-levels-parse.js'
import type { GlobalReference } from './import-official-levels-global-reference.js'

export const buildLevelTileMap = (
  ld: LdData,
  global: GlobalReference,
): Map<string, TileDescriptor> => {
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

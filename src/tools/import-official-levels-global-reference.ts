import { normalizeRawName, parseCurrobjEntries } from './import-official-levels-parse.js'

import type { LdData, TileDescriptor } from './import-official-levels-parse.js'

export type GlobalReference = {
  objectById: Map<
    string,
    {
      desc: TileDescriptor
      tileKey?: string
    }
  >
  tileCandidates: Map<string, Array<{ objectId: string; count: number }>>
}

export const buildGlobalReference = (
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

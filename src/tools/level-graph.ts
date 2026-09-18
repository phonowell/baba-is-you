import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { levelGraphKey } from '../logic/overworld.js'

import type { LevelName } from '../logic/types.js'
import type { OverworldGraph } from '../logic/overworld.js'

// Builds the overworld graph for the predecessor's level tree: a
// directory is a subworld whose `index.txt` is its map; level file and
// directory names follow `N-name.txt` / `x-name.txt` / `extra-N-name.txt`
// / `N-name/` (ported from `to_level_name`).

const MAP_FILE = 'index.txt'

const levelNameForPath = (path: string, isDir: boolean): LevelName | null => {
  const base = path.split('/').pop() ?? ''
  const head = base.split('-')[0] ?? ''
  if (isDir) {
    const n = Number(head)
    return Number.isInteger(n) && head !== ''
      ? { kind: 'subworld', n, icon: '' }
      : null
  }
  if (!base.endsWith('.txt') || base === MAP_FILE) return null
  const n = Number(head)
  if (Number.isInteger(n) && head !== '') return { kind: 'number', n }
  if (head === 'extra') {
    const extraN = Number(base.split('-')[1])
    return Number.isInteger(extraN) ? { kind: 'extra', n: extraN } : null
  }
  if (/^[a-z]$/.test(head)) return { kind: 'letter', c: head }
  return null
}

export const loadLevelGraph = (path: string): OverworldGraph | null => {
  if (!statSync(path).isDirectory())
    return { file: path, children: new Map() }

  const children = new Map<string, OverworldGraph>()
  for (const entry of readdirSync(path)) {
    if (entry === MAP_FILE) continue
    const childPath = join(path, entry)
    const isDir = statSync(childPath).isDirectory()
    if (!isDir && !entry.endsWith('.txt')) continue
    if (isDir && !readdirSync(childPath).includes(MAP_FILE)) continue
    const name = levelNameForPath(childPath, isDir)
    if (!name) continue
    const graph = loadLevelGraph(childPath)
    if (graph) children.set(levelGraphKey(name), graph)
  }

  return { file: join(path, MAP_FILE), children }
}

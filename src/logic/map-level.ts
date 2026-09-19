import { parseLevel } from './parse-level.js'

import type { LevelData, LevelIcon, LevelItem } from './types.js'

// One emitted overworld icon (`levels-maps.ts`): .ld display fields plus
// the target resolution the importer already performed.
export type MapEntryIcon = {
  x: number
  y: number
  file: string
  number: number
  style: number
  colour?: string
  icon?: string
  levelIndex?: number
  mapFile?: string
}

// One emitted overworld map: body text in the shared level format
// (decoration plus injected `line`/`door`/`controls_*` overlay items),
// cursor spawn, parent link, and the icon table.
export type MapEntry = {
  file: string
  title: string
  body: string
  selector?: readonly [number, number]
  parentFile?: string
  icons: readonly MapEntryIcon[]
}

const iconTarget = (icon: MapEntryIcon): LevelIcon => {
  const kind =
    icon.mapFile !== undefined
      ? 'map'
      : icon.levelIndex !== undefined
        ? 'level'
        : 'unresolved'
  return {
    kind,
    file: icon.file,
    number: icon.number,
    style: icon.style,
    ...(icon.colour !== undefined ? { colour: icon.colour } : {}),
    ...(icon.icon !== undefined ? { icon: icon.icon } : {}),
    ...(icon.levelIndex !== undefined ? { levelIndex: icon.levelIndex } : {}),
    ...(icon.mapFile !== undefined ? { mapFile: icon.mapFile } : {}),
  }
}

// Assembles a map into board data: parsed body items plus one `level`
// entity per icon carrying its resolved `levelTarget`. The caller turns
// this into a GameState and places the cursor.
export const levelDataForMap = (entry: MapEntry): LevelData => {
  const level = parseLevel(entry.body)
  let nextId = level.items.reduce((max, item) => Math.max(max, item.id), 0) + 1
  const icons: LevelItem[] = entry.icons.map((icon) => ({
    id: nextId++,
    name: 'level',
    x: icon.x,
    y: icon.y,
    isText: false,
    levelTarget: iconTarget(icon),
  }))
  return {
    ...level,
    items: [...level.items, ...icons],
    meta: {
      palette: '',
      backgrounds: [],
      colorOverrides: {},
      textColorOverrides: {},
      map: {
        ...(entry.selector !== undefined
          ? { selector: entry.selector }
          : {}),
        ...(entry.parentFile !== undefined
          ? { parentFile: entry.parentFile }
          : {}),
      },
    },
  }
}

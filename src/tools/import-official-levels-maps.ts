import path from 'node:path'

import { DEFAULT_OBJECT_ASSIGNMENTS } from './import-official-levels-default-assignments.js'
import { convertOneLevel } from './import-official-levels-convert.js'
import {
  normalizeRawName,
  parseDirection,
  toStatementKey,
} from './import-official-levels-parse.js'

import type { ParsedLayer } from './import-official-levels-binary.js'
import type { LdData, TileDescriptor } from './import-official-levels-parse.js'
import type { GlobalReference } from './import-official-levels-global-reference.js'

// Official map files (`leveltype=1`): the .l grid only carries decoration —
// level icons, path trails, and control hints live in the .ld as overlay
// entries addressed by raw grid coordinates (the same space convertOneLevel
// crops by one border cell, so emitted coordinates are shifted by -1).

export type MapIconEntry = {
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

export type ConvertedMap = {
  file: string
  title: string
  body: string
  selector?: [number, number]
  parentFile?: string
  icons: MapIconEntry[]
}

export const isMapFile = (ld: LdData): boolean =>
  ld.general.get('leveltype') === '1'

const parseNumberedEntries = (
  section: Map<string, string>,
): Map<number, Map<string, string>> => {
  const entries = new Map<number, Map<string, string>>()
  for (const [key, value] of section.entries()) {
    const match = key.match(/^(\d+)([A-Za-z]+)$/)
    if (!match) continue
    const index = Number(match[1])
    const field = match[2]?.toLowerCase() ?? ''
    if (!Number.isFinite(index) || !field) continue
    const entry = entries.get(index) ?? new Map<string, string>()
    entry.set(field, value)
    entries.set(index, entry)
  }
  return entries
}

const intField = (
  entry: Map<string, string>,
  field: string,
): number | undefined => {
  const raw = entry.get(field)
  if (raw === undefined) return undefined
  const value = Number(raw)
  return Number.isFinite(value) ? value : undefined
}

const cleanIconName = (raw: string | undefined): string | undefined => {
  if (!raw) return undefined
  // Vanilla icon files carry an `icon_` prefix plus one or more numeric
  // suffixes ('icon_lake_1', 'blossom_0_1') — all are variant indices.
  const name = raw
    .trim()
    .toLowerCase()
    .replace(/^icon_/, '')
    .replace(/(_\d+)+$/, '')
  return name.length ? name : undefined
}

// Path objects resolve like grid tiles, but the map-specific look lives in
// `objectNNN_image` (door_map gates etc.) — prefer it, then fall through to
// the same name/default chain the grid conversion uses.
const resolveMapPathDesc = (
  ld: LdData,
  objectId: string,
): TileDescriptor => {
  const image = ld.tiles.get(`${objectId}_image`)
  if (image) {
    const desc = normalizeRawName(image, false)
    if (!desc.isText && desc.name.endsWith('_map'))
      desc.name = desc.name.slice(0, -4)
    return desc
  }
  const name = ld.tiles.get(`${objectId}_name`)
  if (name) return normalizeRawName(name, ld.tiles.get(`${objectId}_unittype`) === 'text')
  const numeric = Number(objectId.replace(/^object/, ''))
  if (Number.isFinite(numeric)) {
    const assignment = DEFAULT_OBJECT_ASSIGNMENTS[numeric]
    if (assignment) return normalizeRawName(assignment, false)
  }
  return { name: objectId.toLowerCase(), isText: false }
}

export const convertMap = (
  fileName: string,
  ld: LdData,
  layers: ParsedLayer[],
  global: GlobalReference,
  levelIndexByFile: ReadonlyMap<string, number>,
  mapFiles: ReadonlySet<string>,
): ConvertedMap => {
  const firstLayer = layers[0]
  if (!firstLayer) throw new Error(`No layer found in ${fileName}`)
  const crop = firstLayer.width > 2 && firstLayer.height > 2
  const shift = crop ? 1 : 0
  const toOutput = (value: number): number => value - shift
  const inBounds = (x: number, y: number): boolean =>
    x - shift >= 0 &&
    y - shift >= 0 &&
    x - shift < firstLayer.width - 2 * shift &&
    y - shift < firstLayer.height - 2 * shift

  const { level } = convertOneLevel(fileName, ld, layers, global)
  const overlayLines: string[] = []
  const overlay = new Map<string, Set<string>>()
  const addOverlay = (desc: TileDescriptor, dir: number | undefined, x: number, y: number): void => {
    const key = toStatementKey(desc, parseDirection(dir))
    const coords = overlay.get(key) ?? new Set<string>()
    coords.add(`${x},${y}`)
    overlay.set(key, coords)
  }

  for (const entry of parseNumberedEntries(ld.paths).values()) {
    const objectId = entry.get('object')
    const x = intField(entry, 'x')
    const y = intField(entry, 'y')
    if (!objectId || x === undefined || y === undefined) continue
    if (!inBounds(x, y))
      throw new Error(`${fileName}: path ${objectId} out of bounds at ${x},${y}`)
    addOverlay(resolveMapPathDesc(ld, objectId), intField(entry, 'dir'), toOutput(x), toOutput(y))
  }

  for (const entry of parseNumberedEntries(ld.specials).values()) {
    const data = entry.get('data')
    const x = intField(entry, 'x')
    const y = intField(entry, 'y')
    if (!data || x === undefined || y === undefined) continue
    const [kind, variant] = data.split(',')
    if (kind !== 'controls' || !variant) continue
    if (!inBounds(x, y))
      throw new Error(`${fileName}: controls special out of bounds at ${x},${y}`)
    addOverlay({ name: `controls_${variant}`, isText: false }, undefined, toOutput(x), toOutput(y))
  }

  for (const key of Array.from(overlay.keys()).sort((a, b) => a.localeCompare(b))) {
    const coords = overlay.get(key)
    if (coords?.size) overlayLines.push(`${key} ${Array.from(coords).join(' ')};`)
  }

  const iconNames = new Map<number, string>()
  for (const [index, entry] of parseNumberedEntries(ld.icons).entries()) {
    const name = cleanIconName(entry.get('file'))
    if (name) iconNames.set(index, name)
  }

  const icons: MapIconEntry[] = []
  const iconAt = new Map<string, number>()
  for (const [index, entry] of parseNumberedEntries(ld.levels).entries()) {
    const file = entry.get('file')?.trim().toLowerCase()
    const x = intField(entry, 'x')
    const y = intField(entry, 'y')
    if (!file || x === undefined || y === undefined) continue
    if (!inBounds(x, y))
      throw new Error(`${fileName}: icon ${index} (${file}) out of bounds at ${x},${y}`)
    const style = intField(entry, 'style') ?? 0
    const number = intField(entry, 'number') ?? 0
    const icon: MapIconEntry = {
      x: toOutput(x),
      y: toOutput(y),
      file,
      number,
      style,
    }
    const colour = entry.get('colour')
    if (colour) icon.colour = colour
    const iconName = style === -1 ? iconNames.get(number) : undefined
    if (iconName) icon.icon = iconName
    if (mapFiles.has(file)) icon.mapFile = file
    else {
      const levelIndex = levelIndexByFile.get(file)
      if (levelIndex !== undefined) icon.levelIndex = levelIndex
    }
    // Editor leftovers place several icons on one cell (state alternates);
    // with no progression gating the last-drawn entry is the visible one.
    const posKey = `${icon.x},${icon.y}`
    const existing = iconAt.get(posKey)
    if (existing !== undefined) icons[existing] = icon
    else {
      iconAt.set(posKey, icons.length)
      icons.push(icon)
    }
  }

  const selectorX = intField(ld.general, 'selectorX')
  const selectorY = intField(ld.general, 'selectorY')
  const selector: [number, number] | undefined =
    selectorX !== undefined &&
    selectorY !== undefined &&
    inBounds(selectorX, selectorY)
      ? [toOutput(selectorX), toOutput(selectorY)]
      : undefined

  const title =
    ld.general.get('name') ??
    path.basename(fileName, '.l').replace(/level$/i, '')
  const parentFile = ld.general.get('customparent')?.trim().toLowerCase()

  return {
    file: path.basename(fileName, '.l').toLowerCase(),
    title: title.toUpperCase(),
    body: `${level.body}\n${overlayLines.join('\n')}`,
    ...(selector ? { selector } : {}),
    ...(parentFile && mapFiles.has(parentFile) ? { parentFile } : {}),
    icons,
  }
}

// Imported strings land inside generated TS literals — JSON.stringify
// quotes/escapes scalar fields, template escaping keeps the multi-line
// body block readable without letting `, \ or ${ sequences through.
const tsString = (value: string): string => JSON.stringify(value)
const tsTemplate = (value: string): string =>
  value.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${')

const renderIconLiteral = (icon: MapIconEntry): string => {
  const parts = [
    `x: ${icon.x}`,
    `y: ${icon.y}`,
    `file: ${tsString(icon.file)}`,
    `number: ${icon.number}`,
    `style: ${icon.style}`,
  ]
  if (icon.colour) parts.push(`colour: ${tsString(icon.colour)}`)
  if (icon.icon) parts.push(`icon: ${tsString(icon.icon)}`)
  if (icon.levelIndex !== undefined) parts.push(`levelIndex: ${icon.levelIndex}`)
  if (icon.mapFile) parts.push(`mapFile: ${tsString(icon.mapFile)}`)
  return `{ ${parts.join(', ')} }`
}

export const renderMapsTs = (
  maps: ConvertedMap[],
  rootMapFile: string,
): string => {
  const blocks = maps.map((map) => {
    const selector = map.selector
      ? `    selector: [${map.selector[0]}, ${map.selector[1]}],\n`
      : ''
    const parent = map.parentFile
      ? `    parentFile: ${tsString(map.parentFile)},\n`
      : ''
    const icons = map.icons
      .map((icon) => `      ${renderIconLiteral(icon)},`)
      .join('\n')
    return `  {\n    file: ${tsString(map.file)},\n    title: ${tsString(map.title)},\n${selector}${parent}    body: \`\n${tsTemplate(map.body)}\n    \`,\n    icons: [\n${icons}\n    ],\n  },`
  })
  return `export const rootMapFile = ${tsString(rootMapFile)}\n\nexport const maps = [\n${blocks.join('\n')}\n] as const\n`
}

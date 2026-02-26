import { OBJECT_GLYPHS } from './render-config.js'
import { pickItem, renderRules } from './render-helpers.js'

import type { Direction, GameState, Item } from '../logic/types.js'

const BELT_DIRECTION_GLYPHS: Record<Direction, string> = {
  up: '⬆️',
  right: '➡️',
  down: '⬇️',
  left: '⬅️',
}

const SYNTAX_WORDS = new Set(['is', 'and', 'not', 'has'])

const escapeHtml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')

const textLabel = (name: string): string => name.toUpperCase()

const glyphForItem = (item: Item): string | undefined => {
  if (item.name === 'belt') {
    const dir = item.dir ?? 'right'
    return BELT_DIRECTION_GLYPHS[dir]
  }

  return OBJECT_GLYPHS[item.name]
}

const glyphForLegendName = (name: string): string => {
  if (name === 'belt') return '⬆️➡️⬇️⬅️'
  return OBJECT_GLYPHS[name] ?? ''
}

type CellView = {
  className: string
  value: string
}

export type EntityRenderData = {
  id: number
  x: number
  y: number
  className: string
  value: string
}

export type RenderHtmlUiState = {
  showReferenceDialog: boolean
}

const cellForItem = (item: Item): CellView => {
  if (item.isText) {
    const label = textLabel(item.name)
    const lengthSuffix =
      label.length > 4 ? ' long' : label.length === 3 ? ' three' : ''
    const className = SYNTAX_WORDS.has(item.name)
      ? `cell text syntax${lengthSuffix}`
      : `cell text normal${lengthSuffix}`
    return { className, value: label }
  }

  const glyph = glyphForItem(item)
  if (glyph) return { className: 'cell object', value: glyph }

  return { className: 'cell object fallback', value: textLabel(item.name) }
}

const legendEntries = (names: Set<string>): string[] =>
  Array.from(names)
    .sort()
    .map((name) => {
      const syntaxClass = SYNTAX_WORDS.has(name) ? 'syntax' : 'normal'
      const glyph = glyphForLegendName(name)
      const glyphHtml = glyph
        ? `<span class="legend-glyph">${escapeHtml(glyph)}</span>`
        : ''
      return `<li class="legend-row"><span class="legend-text ${syntaxClass}">${escapeHtml(textLabel(name))}</span><span class="legend-name">${escapeHtml(name)}</span>${glyphHtml}</li>`
    })

export const statusLine = (status: GameState['status']): string => {
  switch (status) {
    case 'win':
      return 'WIN! Press N/Enter for next level.'
    case 'lose':
      return 'DEFEAT! Press R to restart, Q to menu.'
    case 'complete':
      return 'ALL LEVELS CLEARED! Press N to restart.'
    default:
      return 'WASD/Arrows move, U=Undo, R=Restart, Q=Menu'
  }
}

const buildEntityData = (
  state: GameState,
): { entities: EntityRenderData[]; textNames: Set<string> } => {
  const grid = new Map<number, Item[]>()
  const textNames = new Set<string>()

  for (const item of state.items) {
    const key = item.y * state.width + item.x
    const list = grid.get(key) ?? []
    list.push(item)
    grid.set(key, list)
    if (item.isText) textNames.add(item.name)
  }

  const entities: EntityRenderData[] = []
  for (const list of grid.values()) {
    const item = pickItem(list, textNames)
    const cell = cellForItem(item)
    entities.push({ id: item.id, x: item.x, y: item.y, ...cell })
  }

  return { entities, textNames }
}

export const getBoardEntities = (state: GameState): EntityRenderData[] =>
  buildEntityData(state).entities

export const renderHtml = (
  state: GameState,
  uiState: RenderHtmlUiState = { showReferenceDialog: false },
): string => {
  const { textNames } = buildEntityData(state)

  const rules = renderRules(state.rules).map(
    (line) => `<li>${escapeHtml(line)}</li>`,
  )
  const legend = legendEntries(textNames)

  const showDialog = uiState.showReferenceDialog
  const dialogHiddenAttr = showDialog ? '' : ' hidden'

  return [
    '<section class="game-screen" aria-label="Game">',
    '<div class="game-toolbar">',
    `<span class="status" aria-live="polite">${escapeHtml(statusLine(state.status))}</span>`,
    `<button class="btn reference-btn" data-action="toggle-reference" aria-haspopup="dialog" aria-expanded="${showDialog ? 'true' : 'false'}">Rules & Legend</button>`,
    '</div>',
    '<div class="board-wrap">',
    `<div class="board" role="grid" style="--board-width:${state.width};--board-height:${state.height};"></div>`,
    '</div>',
    `<div class="reference-backdrop" data-role="reference-backdrop"${dialogHiddenAttr}>`,
    '<section class="reference-dialog" data-role="reference-dialog" role="dialog" aria-modal="true" aria-label="Rules and legend">',
    '<header class="reference-header">',
    '<button class="btn reference-close" data-action="close-reference" aria-label="Close rules and legend">Close</button>',
    '</header>',
    '<h3 class="reference-subtitle">Rules</h3>',
    `<ul class="rules-list">${rules.length ? rules.join('') : '<li>(no rules)</li>'}</ul>`,
    '<h3 class="reference-subtitle">Legend</h3>',
    `<ul class="legend-list">${legend.length ? legend.join('') : '<li>(no text tiles)</li>'}</ul>`,
    '</section>',
    '</div>',
    '</section>',
  ].join('')
}

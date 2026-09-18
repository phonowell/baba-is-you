import { GAME_CONTROLS, MENU_CONTROLS } from './input.js'
import { GAMEPAD_CONTROLS } from './input-gamepad.js'

import type { GameControlEntry } from './input.js'

export const MENU_WINDOW_SIZE = 10

type MenuLevel = {
  title: string
}

export type MenuHtmlState = {
  levels: MenuLevel[]
  selectedLevelIndex: number
  // Entrance stagger is opt-in: the menu re-renders on every selection
  // change, so only a fresh entry (app start / return from game) should
  // replay the cascade — per-keypress replays would read as flicker.
  animateEntrance?: boolean
}

const escapeHtml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

const pickWindow = (
  total: number,
  selected: number,
  windowSize: number,
): [start: number, end: number] => {
  if (total <= windowSize) return [0, total]

  const half = Math.floor(windowSize / 2)
  const start = clamp(selected - half, 0, total - windowSize)
  return [start, start + windowSize]
}

const renderHintItems = (entries: readonly GameControlEntry[]): string =>
  entries
    .map(
      ({ keys, action }) =>
        `<span class="hint-item"><kbd>${escapeHtml(keys)}</kbd><span>${escapeHtml(action)}</span></span>`,
    )
    .join('')

// Shared with the in-place menu updater in app-draw: the row window the
// current selection renders, and the position readout's inner markup.
export const menuWindowRange = (
  total: number,
  selected: number,
): [start: number, end: number] => pickWindow(total, selected, MENU_WINDOW_SIZE)

export const menuPositionHtml = (
  levels: ReadonlyArray<{ title: string }>,
  selected: number,
): string => {
  const clamped = clamp(selected, 0, Math.max(0, levels.length - 1))
  const title = levels[clamped]?.title ?? '(unknown)'
  const position = `${String(clamped + 1).padStart(3, '0')} / ${levels.length}`
  return `<strong>${position}</strong> ${escapeHtml(title)}`
}

export const renderMenuHtml = (state: MenuHtmlState): string => {
  const total = state.levels.length
  const selected = clamp(state.selectedLevelIndex, 0, Math.max(0, total - 1))
  const [start, end] = pickWindow(total, selected, MENU_WINDOW_SIZE)

  let rowIndex = 0
  const listRows: string[] = []
  if (start > 0) {
    listRows.push(
      `<li class="menu-more" role="presentation" aria-hidden="true" style="--row-i:${rowIndex}">⋮</li>`,
    )
    rowIndex += 1
  }

  for (let i = start; i < end; i += 1) {
    const level = state.levels[i]
    if (!level) continue

    const marker = i === selected ? '&#9670;' : '&nbsp;'
    const number = i + 1
    const title = escapeHtml(level.title)
    const className = i === selected ? 'menu-row selected' : 'menu-row'

    listRows.push(
      `<li class="${className}" role="option" data-action="start-level" data-level-index="${i}" aria-selected="${i === selected ? 'true' : 'false'}" style="--row-i:${rowIndex}"><span class="marker">${marker}</span><span class="num">${number}.</span><span class="name">${title}</span></li>`,
    )
    rowIndex += 1
  }

  if (end < total)
    listRows.push(
      `<li class="menu-more" role="presentation" aria-hidden="true" style="--row-i:${rowIndex}">⋮</li>`,
    )

  const screenClass = state.animateEntrance ? 'menu-screen menu-enter' : 'menu-screen'

  return [
    `<section class="${screenClass}" aria-label="Level Menu">`,
    `<div class="menu-inner" style="--rows:${rowIndex}">`,
    '<header class="menu-header">',
    '<h1 class="title">BABA IS YOU</h1>',
    '<div class="menu-flourish" aria-hidden="true">◆</div>',
    `<p class="menu-count">${total} LEVELS</p>`,
    '</header>',
    '<ol class="menu-list" role="listbox" aria-label="Level list">',
    ...listRows,
    '</ol>',
    `<p class="menu-position" aria-live="polite">${menuPositionHtml(state.levels, selected)}</p>`,
    '<footer class="menu-hints">',
    `<p class="menu-hint"><span class="hint-label">MENU</span>${renderHintItems(MENU_CONTROLS)}</p>`,
    `<p class="menu-hint"><span class="hint-label">IN GAME</span>${renderHintItems(GAME_CONTROLS)}</p>`,
    `<p class="menu-hint"><span class="hint-label">GAMEPAD</span>${renderHintItems(GAMEPAD_CONTROLS)}</p>`,
    '</footer>',
    '</div>',
    '</section>',
  ].join('')
}

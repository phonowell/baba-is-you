import { GAME_CONTROLS, MENU_CONTROLS } from './input.js'
import { GAMEPAD_CONTROLS } from './input-gamepad.js'

import type { GameControlEntry } from './input.js'

// The level list renders as a numbered checkerboard that scrolls all
// levels in place. Five columns keep counting trivial — every row starts
// on a multiple of five. Columns also set the keyboard's row-step — keep
// in sync with app-commands' menu navigation.
export const MENU_GRID_COLUMNS = 5
// PageUp/PageDown jump this many rows inside the same column.
export const MENU_PAGE_ROWS = 4

// Per-cell entrance stagger only animates the first screenful — cells
// past it all share the last delay step, since they're below the fold
// anyway when the menu mounts.
const MENU_ENTRANCE_STAGGER_CAP = 28

export type MenuLevel = {
  title: string
  // Explicit false marks levels with no recorded solution — their cells
  // dim in the grid. An omitted flag means "unknown" and renders normal.
  hasSolution?: boolean
}

export type MenuHtmlState = {
  levels: ReadonlyArray<MenuLevel>
  selectedLevelIndex: number
  // Entrance stagger is opt-in: the menu re-renders on every selection
  // change, so only a fresh entry (app start / return from game) should
  // replay the cascade — per-keypress replays would read as flicker.
  animateEntrance?: boolean
}

// The menu's display order: levels with a recorded solution lead the
// grid, known-unsolvable ones trail — the same split the `no-solution`
// dimming draws. An unset flag counts as solvable (it renders normal).
// The partition is stable so campaign order holds inside each group.
// Returns grid slot -> source index; the app layer translates slots
// back to campaign level indexes through it.
export const orderMenuLevels = (
  levels: ReadonlyArray<Pick<MenuLevel, 'hasSolution'>>,
): number[] => {
  const leading: number[] = []
  const trailing: number[] = []
  levels.forEach((level, index) => {
    ;(level.hasSolution === false ? trailing : leading).push(index)
  })
  return [...leading, ...trailing]
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

const renderHintItems = (entries: readonly GameControlEntry[]): string =>
  entries
    .map(
      ({ keys, action }) =>
        `<span class="hint-item"><kbd>${escapeHtml(keys)}</kbd><span>${escapeHtml(action)}</span></span>`,
    )
    .join('')

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

  const listRows: string[] = []
  for (let i = 0; i < total; i += 1) {
    const number = String(i + 1).padStart(3, '0')
    const checker =
      (Math.floor(i / MENU_GRID_COLUMNS) + (i % MENU_GRID_COLUMNS)) % 2 === 1
    const className = [
      'menu-cell',
      i === selected ? 'selected' : '',
      checker ? 'alt' : '',
      state.levels[i]?.hasSolution === false ? 'no-solution' : '',
    ]
      .filter(Boolean)
      .join(' ')

    listRows.push(
      `<li class="${className}" role="option" data-action="start-level" data-level-index="${i}" aria-selected="${i === selected ? 'true' : 'false'}" style="--row-i:${Math.min(i, MENU_ENTRANCE_STAGGER_CAP)}"><span class="num">${number}</span></li>`,
    )
  }

  const screenClass = state.animateEntrance ? 'menu-screen menu-enter' : 'menu-screen'

  return [
    `<section class="${screenClass}" aria-label="Level Menu">`,
    '<div class="menu-inner">',
    '<header class="menu-header">',
    '<h1 class="title">BABA IS YOU</h1>',
    '<div class="menu-flourish" aria-hidden="true">◆</div>',
    `<p class="menu-count">${total} LEVELS</p>`,
    '</header>',
    '<div class="menu-main">',
    '<ol class="menu-grid" role="listbox" aria-label="Level list">',
    ...listRows,
    '</ol>',
    `<figure class="menu-preview" data-action="start-level" data-level-index="${selected}" role="button" aria-label="Start selected level">`,
    '<canvas class="menu-preview-canvas" aria-hidden="true"></canvas>',
    `<figcaption class="menu-position" aria-live="polite">${menuPositionHtml(state.levels, selected)}</figcaption>`,
    '</figure>',
    '</div>',
    '<footer class="menu-hints">',
    `<p class="menu-hint"><span class="hint-label">MENU</span>${renderHintItems(MENU_CONTROLS)}</p>`,
    `<p class="menu-hint"><span class="hint-label">IN GAME</span>${renderHintItems(GAME_CONTROLS)}</p>`,
    `<p class="menu-hint"><span class="hint-label">GAMEPAD</span>${renderHintItems(GAMEPAD_CONTROLS)}</p>`,
    '</footer>',
    '</div>',
    '</section>',
  ].join('')
}

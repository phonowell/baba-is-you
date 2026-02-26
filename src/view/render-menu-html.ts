import { MENU_WINDOW_SIZE } from './render-menu.js'

type MenuLevel = {
  title: string
}

export type MenuHtmlState = {
  levels: MenuLevel[]
  selectedLevelIndex: number
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

export const renderMenuHtml = (state: MenuHtmlState): string => {
  const total = state.levels.length
  const selected = clamp(state.selectedLevelIndex, 0, Math.max(0, total - 1))
  const selectedTitle = state.levels[selected]?.title ?? '(unknown)'
  const [start, end] = pickWindow(total, selected, MENU_WINDOW_SIZE)

  const listRows: string[] = []
  if (start > 0)
    listRows.push('<li class="menu-row muted" role="option" aria-hidden="true">...</li>')

  for (let i = start; i < end; i += 1) {
    const level = state.levels[i]
    if (!level) continue

    const marker = i === selected ? '&gt;' : '&nbsp;'
    const number = String(i + 1).padStart(3, ' ')
    const title = escapeHtml(level.title)
    const className = i === selected ? 'menu-row selected' : 'menu-row'

    listRows.push(
      `<li class="${className}" role="option" data-action="start-level" data-level-index="${i}" aria-selected="${i === selected ? 'true' : 'false'}"><span class="marker">${marker}</span><span class="num">${number}.</span><span class="name">${title}</span></li>`,
    )
  }

  if (end < total)
    listRows.push('<li class="menu-row muted" role="option" aria-hidden="true">...</li>')

  return [
    '<section class="menu-screen" aria-label="Level Menu">',
    '<h1 class="title">BABA IS YOU</h1>',
    `<p class="meta"><strong>Levels:</strong> ${total}</p>`,
    `<p class="meta" aria-live="polite"><strong>Selected:</strong> ${selected + 1}. ${escapeHtml(selectedTitle)}</p>`,
    '<p class="meta">W/S or Up/Down: select | A/D or Left/Right: page | Enter/N or Click: start</p>',
    '<p class="meta">In game: Q returns to menu</p>',
    '<h2 class="section-title">Select Level</h2>',
    '<ol class="menu-list" role="listbox" aria-label="Level list">',
    ...listRows,
    '</ol>',
    '</section>',
  ].join('')
}

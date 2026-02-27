import { OBJECT_GLYPHS } from './render-config.js'
import { renderRules } from './render-helpers.js'
import { statusLine } from './status-line.js'
import { SYNTAX_WORDS } from './syntax-words.js'

import type { GameState } from '../logic/types.js'

const escapeHtml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')

const textLabel = (name: string): string => name.toUpperCase()

const glyphForLegendName = (name: string): string => {
  if (name === 'belt') return '⬆️➡️⬇️⬅️'
  return OBJECT_GLYPHS[name] ?? ''
}

export type RenderHtmlUiState = {
  showReferenceDialog: boolean
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

const collectTextNames = (state: GameState): Set<string> => {
  const textNames = new Set<string>()
  for (const item of state.items) {
    if (item.props.includes('hide')) continue
    if (item.isText) textNames.add(item.name)
  }
  return textNames
}

export const renderHtml = (
  state: GameState,
  uiState: RenderHtmlUiState = { showReferenceDialog: false },
): string => {
  const textNames = collectTextNames(state)

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

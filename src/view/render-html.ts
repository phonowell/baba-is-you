import { glyphForLegendName } from './render-config.js'
import { renderRules } from './render-helpers.js'
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

export const renderReferenceRulesHtml = (state: GameState): string => {
  const rules = renderRules(state.rules).map(
    (line) => `<li>${escapeHtml(line)}</li>`,
  )
  return rules.length ? rules.join('') : '<li>(no rules)</li>'
}

export const renderReferenceLegendHtml = (state: GameState): string => {
  const textNames = collectTextNames(state)
  const legend = legendEntries(textNames)
  return legend.length ? legend.join('') : '<li>(no text tiles)</li>'
}

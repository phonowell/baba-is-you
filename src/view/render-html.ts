import { GAME_CONTROLS } from './input.js'
import { renderRules } from './render-helpers.js'

import type { GameControlEntry } from './input.js'
import type { GameState } from '../logic/types.js'

const escapeHtml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')

export const renderReferenceRulesHtml = (state: GameState): string => {
  const rules = renderRules(state.rules).map(
    (line) => `<li>${escapeHtml(line)}</li>`,
  )
  return rules.length ? rules.join('') : '<li>(no rules)</li>'
}

export const renderReferenceControlsHtml = (
  entries: readonly GameControlEntry[] = GAME_CONTROLS,
): string =>
  entries.map(
    ({ keys, action }) =>
      `<li class="hint-item"><kbd>${escapeHtml(keys)}</kbd><span>${escapeHtml(action)}</span></li>`,
  ).join('')

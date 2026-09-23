import type { Property } from '../logic/types.js'

export const BOARD3D_RULE_VISUAL_CONFIG = {
  BELT_DIRECTION_GLYPH_UP: '\u2b06\ufe0f',
  BELT_DIRECTION_GLYPH_RIGHT: '\u27a1\ufe0f',
  BELT_DIRECTION_GLYPH_DOWN: '\u2b07\ufe0f',
  BELT_DIRECTION_GLYPH_LEFT: '\u2b05\ufe0f',
  FACING_ARROW_PROPS: new Set<Property>(['you', 'move', 'shift']),
  // Control-layer cards (you/you2/3d) wear an inverted-hull rim tinted by
  // the card's own palette turned negative — "this answers input" reads as
  // the card's photographic negative ringing its silhouette. The shell is
  // the card's geometry inflated around its origin, so ~scale-1 × half the
  // card width lands just over one sprite texel proud of the silhouette.
  // The rim breathes on the idle tick: tint sweeps card colour↔its inverse
  // while the shell swells by SCALE_SWELL, in lockstep across the board.
  YOU_OUTLINE_SCALE: 1.09,
  YOU_OUTLINE_SCALE_SWELL: 0.05,
  YOU_OUTLINE_PULSE_MS: 1100,
} as const

// Text plates wear the level-select menu's chrome: parchment pill faces
// (cream top → warm bottom), a hairline gold keyline inside the edge, and
// the ◆ accent reserved for grammar words — the menu's "active" marker.
// Overridden rules drop to the navy-tile family: dimmed, still readable.
export const BOARD3D_TEXT_CARD_STYLE_CONFIG = {
  TEXT_CARD_SYNTAX_BACKGROUND: '#dcb97a',
  TEXT_CARD_SYNTAX_BACKGROUND_TOP: '#f6e5b4',
  TEXT_CARD_SYNTAX_TEXT: '#513c0c',
  TEXT_CARD_SYNTAX_OUTLINE: '#fbf3d9',
  TEXT_CARD_SYNTAX_KEYLINE: 'rgba(201, 168, 106, 0.75)',
  TEXT_CARD_SYNTAX_DIAMOND: '#c9a86a',
  TEXT_CARD_NORMAL_BACKGROUND: '#e2d7bd',
  TEXT_CARD_NORMAL_BACKGROUND_TOP: '#f8f2e2',
  TEXT_CARD_NORMAL_TEXT: '#3d4757',
  TEXT_CARD_NORMAL_OUTLINE: '#fff9eb',
  TEXT_CARD_NORMAL_KEYLINE: 'rgba(201, 168, 106, 0.55)',
  TEXT_CARD_OVERRIDDEN_BACKGROUND: '#2e3c50',
  TEXT_CARD_OVERRIDDEN_BACKGROUND_TOP: '#3d4757',
  TEXT_CARD_OVERRIDDEN_TEXT: '#a5aec0',
  TEXT_CARD_OVERRIDDEN_OUTLINE: '#1c2434',
  TEXT_CARD_OVERRIDDEN_STRIKE: '#ff6b6b',
  TEXT_CARD_OVERRIDDEN_KEYLINE: 'rgba(201, 168, 106, 0.3)',
} as const

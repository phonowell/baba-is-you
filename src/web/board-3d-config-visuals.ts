import type { Property } from '../logic/types.js'

export const BOARD3D_RULE_VISUAL_CONFIG = {
  BELT_DIRECTION_GLYPH_UP: '\u2b06\ufe0f',
  BELT_DIRECTION_GLYPH_RIGHT: '\u27a1\ufe0f',
  BELT_DIRECTION_GLYPH_DOWN: '\u2b07\ufe0f',
  BELT_DIRECTION_GLYPH_LEFT: '\u2b05\ufe0f',
  FACING_ARROW_PROPS: new Set<Property>(['you', 'move', 'shift']),
  HAS_EMOJI: /\p{Extended_Pictographic}/u,
} as const

export const BOARD3D_TEXT_CARD_STYLE_CONFIG = {
  TEXT_CARD_SYNTAX_BACKGROUND: '#f2dca8',
  TEXT_CARD_SYNTAX_TEXT: '#513c0c',
  TEXT_CARD_SYNTAX_OUTLINE: '#fff9eb',
  TEXT_CARD_NORMAL_BACKGROUND: '#bfd8f6',
  TEXT_CARD_NORMAL_TEXT: '#19324f',
  TEXT_CARD_NORMAL_OUTLINE: '#f4f8ff',
} as const

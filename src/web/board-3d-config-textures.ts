export const BOARD3D_CARD_TEXTURE_CONFIG = {
  CARD_TEXTURE_SIZE: 256,
  CARD_TEXTURE_PAD_RATIO: 0.08,
  // Labels auto-fit the card: font size = fill ratio of the content box,
  // capped so short words stay punchy without long words bleeding off.
  CARD_TEXTURE_TEXT_MAX_FONT_SIZE: 108,
  CARD_TEXTURE_TEXT_FILL_RATIO: 0.88,
  CARD_TEXTURE_LABEL_OFFSET_Y: 4,
  // Labels longer than this wrap onto two lines so they can stay big.
  CARD_TEXTURE_TEXT_MAX_LINE_CHARS: 3,
  // Wrapped lines step by this fraction of the font size: tight enough
  // that the pair still reads as one word, loose enough that the stroke
  // outlines don't touch.
  CARD_TEXTURE_TEXT_LINE_HEIGHT: 0.95,
  // The embolden stroke covers part of this ring; the width stays ahead
  // of it so a visible halo survives around the thickened glyphs.
  CARD_TEXTURE_TEXT_STROKE_WIDTH_RATIO: 0.065,
  // Faux-bold pass: a label-colour stroke under the fill widens glyph
  // stems — the label faces top out at bold, so the stroke thickens them.
  CARD_TEXTURE_TEXT_EMBOLDEN_RATIO: 0.06,
  CARD_TEXTURE_TEXT_FONT_FAMILY:
    '"Trebuchet MS","Arial Rounded MT Bold","Segoe UI Emoji",sans-serif',
  CARD_TEXTURE_DIRECTION_FONT_RATIO: 0.36,
  CARD_TEXTURE_DIRECTION_EDGE_INSET_RATIO: 0.12,
  CARD_TEXTURE_DIRECTION_OFFSET_Y: 1,
  // Menu-pill keyline: a hairline stroke riding just inside the plate's
  // rounded edge — the inset gap plus line width keep it visibly thin at
  // card scale, like the 1px filigree inside menu rows.
  CARD_TEXTURE_KEYLINE_INSET: 9,
  CARD_TEXTURE_KEYLINE_WIDTH: 6,
  // The ◆ flourish mounts on the top keyline segment (menu-flourish
  // geometry: a gem flanked by hairlines). Half-height must exceed the
  // keyline width so the line reads as running behind the gem.
  CARD_TEXTURE_DIAMOND_HALF_HEIGHT: 11,
  CARD_TEXTURE_DIAMOND_TAPER: 0.78,
  // Overridden-rule cross: fraction of the card the pixel X spans, and the
  // mark's opacity — translucent so the struck label stays readable.
  CARD_TEXTURE_OVERRIDDEN_CROSS_RATIO: 0.62,
  CARD_TEXTURE_OVERRIDDEN_CROSS_ALPHA: 0.55,
} as const

export const BOARD3D_SHADOW_TEXTURE_CONFIG = {
  SHADOW_TEXTURE_SIZE: 128,
  SHADOW_TEXTURE_CENTER: 64,
  SHADOW_TEXTURE_INNER_RADIUS: 17,
  SHADOW_TEXTURE_OUTER_RADIUS: 50,
  SHADOW_TEXTURE_STOP_0: 'rgba(0, 0, 0, 0.25)',
  SHADOW_TEXTURE_STOP_1: 'rgba(0, 0, 0, 0.09)',
  SHADOW_TEXTURE_STOP_2: 'rgba(0, 0, 0, 0)',
  SHADOW_TEXTURE_STOP_1_AT: 0.48,
} as const

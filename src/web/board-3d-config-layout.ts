export const BOARD3D_LAYOUT_CONFIG = {
  CARD_WORLD_SIZE: 0.88,
  CARD_STACK_DEPTH: 0.05,
  CARD_STACK_LATERAL_SPREAD: 0.06,
  CARD_STACK_DEPTH_SPREAD: 0.06,
  CARD_BASE_Z: 0.09,
  CARD_LAYER_DEPTH: 0.045,
  GROUND_SURFACE_Z: -0.24,
  GROUND_ACTIVE_FILL_Z: -0.224,
  GROUND_HUG_BASE_Z: -0.219,
  GROUND_HUG_STACK_DEPTH: 0.001,
  FLOAT_ITEM_LIFT_Z: 0.14,
  GROUND_EXPANDED_MIN_SIZE: 220,
  CELL_GRID_Z: -0.221,
  CELL_GRID_COLOR: '#3f6e28',
  CELL_GRID_OPACITY: 0.24,
  // Dash/gap in world units (one cell = 1); the lineDistance attribute is
  // world-space, so these read directly off the board.
  CELL_GRID_DASH_SIZE: 0.08,
  CELL_GRID_GAP_SIZE: 0.05,
  PLAY_AREA_CORNER_RADIUS: 0.34,
  CARD_FACE_CAMERA_BLEND: 0.55,
  TEXTURE_ANISOTROPY_CAP: 8,
  CARD_MATERIAL_ALPHA_TEST: 0.08,
  CARD_MATERIAL_EMISSIVE_COLOR: '#101019',
  GROUND_EXPANDED_PADDING: 0.65,
  // Genshin-style grass: warm yellow-green; the play area reads as a
  // sunnier patch of the same meadow rather than a second surface.
  // Kept a touch brighter than the target since the mottle map multiplies.
  GROUND_BASE_COLOR: '#7ab858',
  PLAY_AREA_FILL_COLOR: '#98d463',
  // World units per painterly-mottle tile — blotch scale ends up sub-cell.
  GROUND_MOTTLE_TILE_WORLD: 14,
  ENTITY_IDLE_SHADOW_SCALE: 0.62,
  POSITION_EPSILON: 0.0001,
  PLAY_AREA_RADIUS_CLAMP_RATIO: 0.35,
} as const

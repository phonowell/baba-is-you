// Voxel volume dimensions (world units, relative to the 1x1 card cell) and
// the baked per-face shading used for vertex colors. Depth is authored in
// voxel layers of one texel each, so proportions stay pixel-true.
export const BOARD3D_VOXEL_CONFIG = {
  VOXEL_INNER_SIZE_RATIO: 0.84,
  // World z of the frame plane's front face — keeps the front view where
  // the old slab put it; authored/inflated depth grows behind it.
  VOXEL_FRAME_Z: 0.11,
  // Back slices stacked under upright sprite cards that lack authored
  // volumes — a thin 3-texel slab, just enough for a visible edge.
  VOXEL_CARD_BACK_LAYERS: 2,
  // Back slices stacked under ground-hug tiles (3 texels ≈ old slab depth).
  VOXEL_GROUND_HUG_BACK_LAYERS: 2,
  // Corner radius of the text/emoji plate, world units — the rounded slab
  // silhouette doubles as the card's rounded face edge.
  VOXEL_PLATE_CORNER_RADIUS: 0.12,
  VOXEL_SHADE_FRONT: 1.0,
  VOXEL_SHADE_TOP: 1.18,
  VOXEL_SHADE_SIDE: 0.72,
  VOXEL_SHADE_BOTTOM: 0.5,
  VOXEL_SHADE_BACK: 0.35,
  // Flat one-voxel silhouette rim on the frame plane of object sprites (not
  // ground-hug tiles) — keeps pale sprites like baba readable on the board.
  VOXEL_OUTLINE_COLOR: '#141b2a',
  // Upright models lean back this much (radians) so the camera — pitched
  // ~75deg down — still reads the face/back instead of only the top. The
  // yaw then keeps the lean pointing "behind" whatever direction it faces.
  VOXEL_STAND_LEAN: 0.62,
  // Extra lift (world units) so the leaning model's lowest point still rests
  // on the ground instead of clipping through it.
  VOXEL_STAND_LIFT: 0.06,
} as const

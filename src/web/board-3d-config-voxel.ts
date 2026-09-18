// Voxel volume dimensions (world units, relative to the 1x1 card cell) and
// the baked per-face shading used for vertex colors. Depth is authored in
// voxel layers of one texel each, so proportions stay pixel-true.
export const BOARD3D_VOXEL_CONFIG = {
  VOXEL_INNER_SIZE_RATIO: 0.84,
  // World z of the frame plane's front face — keeps the front view where
  // the old slab put it; authored/inflated depth grows behind it.
  VOXEL_FRAME_Z: 0.11,
  // Inflate fallback: erosion rings resampled to ~2x ring count, capped —
  // depth tracks silhouette width so wide sprites dome and thin ones don't
  // blow up. Sprites too thin to erode keep at least this many copies.
  VOXEL_INFLATE_MAX_LAYERS: 12,
  VOXEL_INFLATE_MIN_LAYERS: 3,
  // Back slices stacked under ground-hug tiles (3 texels ≈ old slab depth).
  VOXEL_GROUND_HUG_BACK_LAYERS: 2,
  VOXEL_PLATE_DEPTH: 0.12,
  VOXEL_SHADE_FRONT: 1.0,
  VOXEL_SHADE_TOP: 1.18,
  VOXEL_SHADE_SIDE: 0.72,
  VOXEL_SHADE_BOTTOM: 0.5,
  VOXEL_SHADE_BACK: 0.35,
  VOXEL_PLATE_EDGE_SHADE: 0.45,
  // Flat one-voxel silhouette rim on the frame plane of object sprites (not
  // ground-hug tiles) — keeps pale sprites like baba readable on the board.
  VOXEL_OUTLINE_COLOR: '#141b2a',
} as const

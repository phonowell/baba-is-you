// Voxel slab dimensions (world units, relative to the 1x1 card cell) and the
// baked per-face shading used for vertex colors.
export const BOARD3D_VOXEL_CONFIG = {
  VOXEL_INNER_SIZE_RATIO: 0.84,
  VOXEL_DEPTH_OBJECT: 0.22,
  VOXEL_DEPTH_GROUND_HUG: 0.07,
  VOXEL_PLATE_DEPTH: 0.12,
  VOXEL_ARROW_LIFT: 0.06,
  VOXEL_SHADE_FRONT: 1.0,
  VOXEL_SHADE_TOP: 1.18,
  VOXEL_SHADE_SIDE: 0.72,
  VOXEL_SHADE_BOTTOM: 0.5,
  VOXEL_SHADE_BACK: 0.35,
  VOXEL_PLATE_EDGE_SHADE: 0.45,
} as const

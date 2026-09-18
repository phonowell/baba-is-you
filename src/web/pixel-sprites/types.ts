// Pixel-art sprite model: frames are rows of single-character palette keys,
// '.' always means transparent. Grids are up to 24x24; shorter rows are
// treated as right-padded with transparency.
export type PixelFrame = readonly string[]

// Hand-authored 3D volume around the frame plane. `backSlices[i]` sits i+1
// voxels behind the z=0 plane, `frontSlices[i]` protrudes i+1 voxels toward
// the camera. Each slice is one voxel thick, so slice count directly
// controls body depth — slices may extend beyond the front silhouette
// (ears, bulk) or taper inside it. By default the sprite frame is the z=0
// slice; a volume may instead supply its own `frame`, making the voxel set
// fully sculpted with no sprite silhouette anywhere.
export type PixelVolume = {
  frontSlices?: readonly PixelFrame[] | undefined
  frame?: PixelFrame | undefined
  backSlices?: readonly PixelFrame[] | undefined
}

// Painted-cell bounds inside the sprite grid (inclusive, cell units).
export type FrameBounds = { minX: number; minY: number; maxX: number; maxY: number }

export type PixelSprite = {
  palette: Record<string, string>
  frames: readonly PixelFrame[]
  // Optional authored volumes, aligned with `frames` by index. Missing
  // entries fall back to procedural inflation; wobble-derived frames reuse
  // the base frame's volume shifted by the same vertical offset.
  volumes?: readonly (PixelVolume | undefined)[]
}

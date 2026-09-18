// Pixel-art sprite model: frames are rows of single-character palette keys,
// '.' always means transparent. Grids are up to 24x24; shorter rows are
// treated as right-padded with transparency.
export type PixelFrame = readonly string[]

export type PixelSprite = {
  palette: Record<string, string>
  frames: readonly PixelFrame[]
}

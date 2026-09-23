import { contentBounds, frameSize } from './derive.js'

import type { FrameBounds, PixelFrame, PixelSprite, PixelVolume } from './types.js'

// Authoring-time repaint of an existing sprite — mostly used to promote an
// imported official silhouette into the hand-drawn style: the shape stays,
// the palette gains saturated base/light/dark tones. `map` rewrites palette
// keys (anything unmapped becomes transparent), `shade` splits a key into
// light/dark bands along the top-left→bottom-right diagonal across the
// sprite's content bounds, and `set` fixes individual cells per frame.
export type RecolorSpec = {
  palette: Record<string, string>
  map: Record<string, string>
  // Region rekey, applied after `map`: [fromKey, minY, maxY, toKey] with an
  // optional [minX, maxX] column clamp — used to split one imported tone
  // into parts (bee wings vs body, car greenhouse vs doors).
  bands?:
    | readonly (readonly [string, number, number, string, number?, number?])[]
    | undefined
  // Fill enclosed transparent cells (flood-filled from the frame edge) with
  // this key — clock faces, burger sesame gaps. Holes open to the edge
  // stay transparent.
  fill?: string | undefined
  shade?:
    | Record<
        string,
        {
          light?: string | undefined
          dark?: string | undefined
          // Diagonal position t in 0..1 (top-left → bottom-right). Cells
          // below `lightBelow` read lit, at or above `darkAbove` read shaded.
          lightBelow?: number | undefined
          darkAbove?: number | undefined
        }
      >
    | undefined
  set?: readonly (readonly [number, number, number, string])[] | undefined
}

const mapFrame = (frame: PixelFrame, map: Record<string, string>): PixelFrame =>
  frame.map((row) =>
    [...row].map((key) => (key === '.' ? '.' : (map[key] ?? '.'))).join(''),
  )

const unionBounds = (frames: readonly PixelFrame[]): FrameBounds | null => {
  let union: FrameBounds | null = null
  for (const frame of frames) {
    const bounds = contentBounds(frame)
    if (!bounds) continue
    union = union
      ? {
          minX: Math.min(union.minX, bounds.minX),
          minY: Math.min(union.minY, bounds.minY),
          maxX: Math.max(union.maxX, bounds.maxX),
          maxY: Math.max(union.maxY, bounds.maxY),
        }
      : bounds
  }
  return union
}

const diagonal = (x: number, y: number, bounds: FrameBounds): number => {
  const w = Math.max(bounds.maxX - bounds.minX, 1)
  const h = Math.max(bounds.maxY - bounds.minY, 1)
  return ((x - bounds.minX) / w + (y - bounds.minY) / h) / 2
}

const shadeFrame = (
  frame: PixelFrame,
  shade: NonNullable<RecolorSpec['shade']>,
  bounds: FrameBounds,
): PixelFrame =>
  frame.map((row, y) =>
    [...row]
      .map((key, x) => {
        const spec = shade[key]
        if (!spec) return key
        const t = diagonal(x, y, bounds)
        if (spec.light && t < (spec.lightBelow ?? 0.32)) return spec.light
        if (spec.dark && t >= (spec.darkAbove ?? 0.68)) return spec.dark
        return key
      })
      .join(''),
  )

const fillHoles = (frame: PixelFrame, key: string): PixelFrame => {
  const { width, height } = frameSize(frame)
  const at = (x: number, y: number): string => frame[y]?.[x] ?? '.'
  const open = new Set<number>()
  const queue: [number, number][] = []
  const push = (x: number, y: number): void => {
    if (x < 0 || y < 0 || x >= width || y >= height) return
    if (at(x, y) !== '.') return
    const id = y * width + x
    if (open.has(id)) return
    open.add(id)
    queue.push([x, y])
  }
  for (let x = 0; x < width; x += 1) {
    push(x, 0)
    push(x, height - 1)
  }
  for (let y = 0; y < height; y += 1) {
    push(0, y)
    push(width - 1, y)
  }
  for (let i = 0; i < queue.length; i += 1) {
    const [x, y] = queue[i]!
    push(x + 1, y)
    push(x - 1, y)
    push(x, y + 1)
    push(x, y - 1)
  }
  return frame.map((row, y) =>
    [...row]
      .map((cell, x) => (cell === '.' && !open.has(y * width + x) ? key : cell))
      .join(''),
  )
}

const applyBands = (
  frame: PixelFrame,
  bands: NonNullable<RecolorSpec['bands']>,
): PixelFrame =>
  frame.map((row, y) =>
    [...row]
      .map((key, x) => {
        for (const [from, minY, maxY, to, minX, maxX] of bands) {
          if (
            key === from &&
            y >= minY &&
            y <= maxY &&
            x >= (minX ?? 0) &&
            x <= (maxX ?? Infinity)
          )
            return to
        }
        return key
      })
      .join(''),
  )

// The region/shade passes run on any frame grid — flat frames and voxel
// slices alike — so a banded recolor keeps the 3D depth in the same
// tones as the visible face. (`set` stays frame-only: its coordinates
// index `frames`, not slice layers.)
const applyRegions = (
  frame: PixelFrame,
  spec: RecolorSpec,
  bounds: FrameBounds | null,
): PixelFrame => {
  let out = frame
  if (spec.bands) out = applyBands(out, spec.bands)
  if (spec.fill) out = fillHoles(out, spec.fill)
  if (spec.shade && bounds) out = shadeFrame(out, spec.shade, bounds)
  return out
}

const mapVolume = (
  volume: PixelVolume,
  spec: RecolorSpec,
  bounds: FrameBounds | null,
): PixelVolume => ({
  ...(volume.frontSlices
    ? {
        frontSlices: volume.frontSlices.map((f) =>
          applyRegions(mapFrame(f, spec.map), spec, bounds),
        ),
      }
    : {}),
  ...(volume.frame
    ? { frame: applyRegions(mapFrame(volume.frame, spec.map), spec, bounds) }
    : {}),
  ...(volume.backSlices
    ? {
        backSlices: volume.backSlices.map((f) =>
          applyRegions(mapFrame(f, spec.map), spec, bounds),
        ),
      }
    : {}),
})

export const recolorSprite = (sprite: PixelSprite, spec: RecolorSpec): PixelSprite => {
  const mapped = sprite.frames.map((frame) => mapFrame(frame, spec.map))
  // Shade bounds come from the mapped+banded+filled frames — the same
  // footprint the volumes share.
  const preShaded = mapped.map((frame) => {
    let out = frame
    if (spec.bands) out = applyBands(out, spec.bands)
    if (spec.fill) out = fillHoles(out, spec.fill)
    return out
  })
  const bounds = unionBounds(preShaded)
  const shaded =
    spec.shade && bounds
      ? preShaded.map((frame) => shadeFrame(frame, spec.shade!, bounds))
      : preShaded
  const patched = shaded.slice()
  for (const [frameIx, x, y, key] of spec.set ?? []) {
    const frame = patched[frameIx]
    const row = frame?.[y]
    if (!frame || row === undefined || x < 0 || x >= row.length) continue
    patched[frameIx] = frame.map((r, ry) =>
      ry === y ? r.slice(0, x) + key + r.slice(x + 1) : r,
    )
  }
  return {
    palette: spec.palette,
    frames: patched,
    ...(sprite.volumes
      ? {
          volumes: sprite.volumes.map((v) =>
            v ? mapVolume(v, spec, bounds) : v,
          ),
        }
      : {}),
  }
}

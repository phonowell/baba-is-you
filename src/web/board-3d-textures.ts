import {
  CanvasTexture,
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  NearestFilter,
  RedFormat,
  RepeatWrapping,
  SRGBColorSpace,
} from 'three'

import {
  BOARD3D_CARD_TEXTURE_CONFIG,
  BOARD3D_SHADOW_TEXTURE_CONFIG,
} from './board-3d-config-textures.js'
import { BOARD3D_LAYOUT_CONFIG } from './board-3d-config-layout.js'
import { BOARD3D_VOXEL_CONFIG } from './board-3d-config-voxel.js'
import {
  cardLabelLines,
  orientedSpriteForSpec,
} from './board-3d-shared-item.js'
import {
  dilateFrame,
  frameSize,
  spriteContentBounds,
  spriteFrames,
} from './pixel-sprites/derive.js'
import {
  drawPixelFrame,
  drawPixelFrameUniform,
  frameContentDrawRect,
} from './pixel-sprites/blit.js'
import {
  ARROW_FILL_PALETTE,
  ARROW_SHADOW_PALETTE,
  DIRECTION_ARROW_FRAMES,
} from './pixel-sprites/arrows.js'
import { OVERRIDDEN_CROSS_FRAME } from './pixel-sprites/cross.js'

import type { Direction } from '../logic/types.js'
import type { CardSpec } from './board-3d-shared-types.js'
import type { PixelSprite } from './pixel-sprites/types.js'

const {
  CARD_TEXTURE_SIZE,
  CARD_TEXTURE_PAD_RATIO,
  CARD_TEXTURE_TEXT_MAX_FONT_SIZE,
  CARD_TEXTURE_TEXT_FILL_RATIO,
  CARD_TEXTURE_LABEL_OFFSET_Y,
  CARD_TEXTURE_TEXT_LINE_HEIGHT,
  CARD_TEXTURE_TEXT_STROKE_WIDTH_RATIO,
  CARD_TEXTURE_TEXT_FONT_FAMILY,
  CARD_TEXTURE_DIRECTION_FONT_RATIO,
  CARD_TEXTURE_DIRECTION_EDGE_INSET_RATIO,
  CARD_TEXTURE_DIRECTION_OFFSET_Y,
  CARD_TEXTURE_KEYLINE_INSET,
  CARD_TEXTURE_KEYLINE_WIDTH,
  CARD_TEXTURE_DIAMOND_HALF_HEIGHT,
  CARD_TEXTURE_DIAMOND_TAPER,
  CARD_TEXTURE_OVERRIDDEN_CROSS_RATIO,
  CARD_TEXTURE_OVERRIDDEN_CROSS_ALPHA,
} = BOARD3D_CARD_TEXTURE_CONFIG

const { CARD_WORLD_SIZE } = BOARD3D_LAYOUT_CONFIG
const { VOXEL_PLATE_CORNER_RADIUS } = BOARD3D_VOXEL_CONFIG

const {
  SHADOW_TEXTURE_SIZE,
  SHADOW_TEXTURE_CENTER,
  SHADOW_TEXTURE_INNER_RADIUS,
  SHADOW_TEXTURE_OUTER_RADIUS,
  SHADOW_TEXTURE_STOP_0,
  SHADOW_TEXTURE_STOP_1,
  SHADOW_TEXTURE_STOP_2,
  SHADOW_TEXTURE_STOP_1_AT,
} = BOARD3D_SHADOW_TEXTURE_CONFIG

const createCanvasTexture = (
  canvas: HTMLCanvasElement,
  anisotropy: number,
  nearest: boolean,
): CanvasTexture => {
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  // Cards are minified well below texture size; mipmaps keep text/shapes
  // stable instead of shimmering. Pixel sprites keep Nearest on both ends.
  texture.minFilter = nearest ? NearestFilter : LinearMipmapLinearFilter
  texture.magFilter = nearest ? NearestFilter : LinearFilter
  texture.anisotropy = anisotropy
  return texture
}

// Pixel arrow overlay: shadow pass offset a couple of texels keeps the
// indicator readable on light sprites. Centered on the facing edge inset.
const drawDirectionArrow = (
  ctx: CanvasRenderingContext2D,
  direction: Direction,
  pad: number,
  textureSize: number,
): void => {
  const frame = DIRECTION_ARROW_FRAMES[direction]
  const { width, height } = frameSize(frame)
  if (width === 0 || height === 0) return
  const arrowSize = Math.round(textureSize * CARD_TEXTURE_DIRECTION_FONT_RATIO)
  const texel = arrowSize / Math.max(width, height)
  const edgeInset = pad + textureSize * CARD_TEXTURE_DIRECTION_EDGE_INSET_RATIO
  const center = textureSize / 2
  const markerX =
    direction === 'left' ? edgeInset : direction === 'right' ? textureSize - edgeInset : center
  const markerY =
    direction === 'up' ? edgeInset : direction === 'down' ? textureSize - edgeInset : center
  const dstX = markerX - (width * texel) / 2
  const dstY = markerY + CARD_TEXTURE_DIRECTION_OFFSET_Y - (height * texel) / 2
  const shadow = Math.max(1, Math.round(texel / 3))
  drawPixelFrameUniform(ctx, frame, ARROW_SHADOW_PALETTE, dstX + shadow, dstY + shadow, texel)
  drawPixelFrameUniform(ctx, frame, ARROW_FILL_PALETTE, dstX, dstY, texel)
}

// Vetoed-rule mark: a chunky pixel X centered on the card, same language as
// the facing arrow. The dilated dark pad underneath reads as a one-texel
// outline — the voxel arrow overlay's dark slice, flattened — keeping the
// red cross readable on the dimmed card. The whole mark is translucent so
// the struck label still shows through.
const drawOverriddenCross = (
  ctx: CanvasRenderingContext2D,
  textureSize: number,
  fillColor: string,
  padColor: string,
): void => {
  const { width, height } = frameSize(OVERRIDDEN_CROSS_FRAME)
  const texel = (textureSize * CARD_TEXTURE_OVERRIDDEN_CROSS_RATIO) /
    Math.max(width, height)
  const center = textureSize / 2
  const pad = dilateFrame(OVERRIDDEN_CROSS_FRAME)
  const padSize = frameSize(pad)
  ctx.globalAlpha = CARD_TEXTURE_OVERRIDDEN_CROSS_ALPHA
  drawPixelFrameUniform(
    ctx,
    pad,
    { x: padColor },
    center - (padSize.width * texel) / 2,
    center - (padSize.height * texel) / 2,
    texel,
  )
  drawPixelFrameUniform(
    ctx,
    OVERRIDDEN_CROSS_FRAME,
    { x: fillColor },
    center - (width * texel) / 2,
    center - (height * texel) / 2,
    texel,
  )
  ctx.globalAlpha = 1
}

// Pixel sprites are drawn nearest-neighbor onto a transparent card; the
// facing arrow overlay still applies on top.
const createSpriteFrameTexture = (
  spec: CardSpec,
  sprite: PixelSprite,
  frameIx: number,
  anisotropy: number,
): CanvasTexture => {
  const textureSize = CARD_TEXTURE_SIZE
  const canvas = document.createElement('canvas')
  canvas.width = textureSize
  canvas.height = textureSize
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Failed to create sprite texture context.')

  const pad = textureSize * CARD_TEXTURE_PAD_RATIO
  const box = textureSize - pad * 2
  const frame = spriteFrames(sprite)[frameIx]
  if (!frame) throw new Error(`Missing sprite frame ${frameIx}.`)
  const bounds = spriteContentBounds(sprite)
  if (bounds) {
    const rect = frameContentDrawRect(bounds, pad, pad, box)
    drawPixelFrameUniform(ctx, frame, sprite.palette, rect.x, rect.y, rect.texel)
  } else {
    drawPixelFrame(ctx, frame, sprite.palette, pad, pad, box)
  }

  if (spec.facingDirection) {
    drawDirectionArrow(ctx, spec.facingDirection, pad, textureSize)
  }

  return createCanvasTexture(canvas, anisotropy, true)
}

// One texture per animation frame; sprites without hand-drawn frames are
// padded to the shared count by the derive layer's wobble.
export const createCardTextures = (
  spec: CardSpec,
  anisotropy: number,
): CanvasTexture[] => {
  if (!spec.sprite) return [createCardTexture(spec, anisotropy)]
  const sprite = orientedSpriteForSpec(spec)
  if (!sprite) return [createCardTexture(spec, anisotropy)]
  return spriteFrames(sprite).map((_, ix) =>
    createSpriteFrameTexture(spec, sprite, ix, anisotropy),
  )
}

// The menu's hairline keyline: a thin stroke inset from the card edge,
// following the plate silhouette so it stays parallel all the way around
// the corners — the same inset-1px gold filigree the menu rows wear.
const traceKeylinePath = (
  ctx: CanvasRenderingContext2D,
  inset: number,
  radius: number,
  textureSize: number,
): void => {
  const max = textureSize - inset
  ctx.beginPath()
  ctx.moveTo(inset + radius, inset)
  ctx.lineTo(max - radius, inset)
  ctx.arcTo(max, inset, max, inset + radius, radius)
  ctx.lineTo(max, max - radius)
  ctx.arcTo(max, max, max - radius, max, radius)
  ctx.lineTo(inset + radius, max)
  ctx.arcTo(inset, max, inset, max - radius, radius)
  ctx.lineTo(inset, inset + radius)
  ctx.arcTo(inset, inset, inset + radius, inset, radius)
  ctx.closePath()
}

// ◆ mounted on the top keyline segment — the menu-flourish transplanted
// onto the card: a small gem the keyline reads as running behind.
const drawKeylineDiamond = (
  ctx: CanvasRenderingContext2D,
  textureSize: number,
  color: string,
): void => {
  const cx = textureSize / 2
  const cy = CARD_TEXTURE_KEYLINE_INSET
  const halfH = CARD_TEXTURE_DIAMOND_HALF_HEIGHT
  const halfW = halfH * CARD_TEXTURE_DIAMOND_TAPER
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(cx, cy - halfH)
  ctx.lineTo(cx + halfW, cy)
  ctx.lineTo(cx, cy + halfH)
  ctx.lineTo(cx - halfW, cy)
  ctx.closePath()
  ctx.fill()
}

export const createCardTexture = (spec: CardSpec, anisotropy: number): CanvasTexture => {
  const textureSize = CARD_TEXTURE_SIZE
  const canvas = document.createElement('canvas')
  canvas.width = textureSize
  canvas.height = textureSize
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Failed to create card texture context.')

  const pad = textureSize * CARD_TEXTURE_PAD_RATIO
  const size = textureSize - pad * 2

  // Cards are silhouette cards: the face fills the whole card square, so
  // the plate edge and the face edge are the same line. Menu-pill specs
  // carry a brighter top stop — the parchment gradient the menu rows use.
  if (spec.backgroundTop) {
    const gradient = ctx.createLinearGradient(0, 0, 0, textureSize)
    gradient.addColorStop(0, spec.backgroundTop)
    gradient.addColorStop(1, spec.background)
    ctx.fillStyle = gradient
  } else {
    ctx.fillStyle = spec.background
  }
  ctx.fillRect(0, 0, textureSize, textureSize)

  if (spec.keylineColor) {
    const edgeRadius = (VOXEL_PLATE_CORNER_RADIUS / CARD_WORLD_SIZE) * textureSize
    const radius = Math.max(0, edgeRadius - CARD_TEXTURE_KEYLINE_INSET)
    traceKeylinePath(ctx, CARD_TEXTURE_KEYLINE_INSET, radius, textureSize)
    ctx.strokeStyle = spec.keylineColor
    ctx.lineWidth = CARD_TEXTURE_KEYLINE_WIDTH
    ctx.stroke()
    if (spec.diamondColor) drawKeylineDiamond(ctx, textureSize, spec.diamondColor)
  }

  // Measure at 100px then scale to fill the content box — short words
  // cap out big; long words wrap onto two lines so each line stays big
  // instead of shrinking to fit one row. The font must fit the widest
  // line horizontally and the whole line block vertically.
  const lines = cardLabelLines(spec)
  const fit = size * CARD_TEXTURE_TEXT_FILL_RATIO
  ctx.font = `700 100px ${CARD_TEXTURE_TEXT_FONT_FAMILY}`
  const fontSize = Math.min(
    CARD_TEXTURE_TEXT_MAX_FONT_SIZE,
    Math.floor(fit / (lines.length * CARD_TEXTURE_TEXT_LINE_HEIGHT)),
    ...lines.map((line) =>
      Math.floor((100 * fit) / Math.max(ctx.measureText(line).width, 1)),
    ),
  )

  const lineStep = fontSize * CARD_TEXTURE_TEXT_LINE_HEIGHT
  const firstLineY =
    textureSize / 2 +
    CARD_TEXTURE_LABEL_OFFSET_Y -
    ((lines.length - 1) * lineStep) / 2
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = spec.textColor
  ctx.font = `700 ${fontSize}px ${CARD_TEXTURE_TEXT_FONT_FAMILY}`

  ctx.lineWidth = textureSize * CARD_TEXTURE_TEXT_STROKE_WIDTH_RATIO
  ctx.lineJoin = 'round'
  ctx.strokeStyle = spec.outlineColor
  lines.forEach((line, ix) => {
    const y = firstLineY + ix * lineStep
    ctx.strokeText(line, textureSize / 2, y)
    ctx.fillText(line, textureSize / 2, y)
  })

  if (spec.strikethrough) {
    drawOverriddenCross(
      ctx,
      textureSize,
      spec.strikeColor ?? spec.textColor,
      spec.outlineColor,
    )
  }

  if (spec.facingDirection) {
    drawDirectionArrow(ctx, spec.facingDirection, pad, textureSize)
  }

  return createCanvasTexture(canvas, anisotropy, false)
}

// Toon shading bands: dotNL is quantized through this map into a few
// luminance steps — the anime cel look. The floor stays high (≈0.66) so
// shadowed faces remain luminous instead of crushing to black; Genshin's
// painted shadows are colourful, never dead dark. Shared by every toon
// material as a lazily-created module singleton; disposeToonGradientMap
// resets it for renderer teardown/recreate cycles.
const TOON_GRADIENT_STEPS = [182, 214, 238, 255] as const

let toonGradientMap: DataTexture | null = null

export const getToonGradientMap = (): DataTexture => {
  if (!toonGradientMap) {
    toonGradientMap = new DataTexture(
      new Uint8Array(TOON_GRADIENT_STEPS),
      TOON_GRADIENT_STEPS.length,
      1,
      RedFormat,
    )
    toonGradientMap.minFilter = NearestFilter
    toonGradientMap.magFilter = NearestFilter
    toonGradientMap.needsUpdate = true
  }
  return toonGradientMap
}

export const disposeToonGradientMap = (): void => {
  toonGradientMap?.dispose()
  toonGradientMap = null
}

// Painterly ground mottle: soft colour blotches + fine speckle multiply over
// the flat grass colour, approximating the hand-painted terrain texture that
// keeps Genshin fields from reading as flat fills. The canvas is a shared
// singleton; each call returns a fresh CanvasTexture clone over it so callers
// can set per-mesh repeat and dispose their own texture.
const GROUND_MOTTLE_SIZE = 512
const GROUND_MOTTLE_BASE = 'rgb(240,240,230)'
const GROUND_MOTTLE_BLOTCHES: readonly string[] = [
  'rgb(255,250,214)', // sunlit warm
  'rgb(214,236,214)', // sage
  'rgb(214,228,244)', // cool haze
  'rgb(196,216,190)', // deeper grass
]
const GROUND_MOTTLE_SPECKLE = ['rgb(255,255,250)', 'rgb(190,205,185)']

let groundMottleCanvas: HTMLCanvasElement | null = null

const drawGroundMottleCanvas = (): HTMLCanvasElement => {
  const canvas = document.createElement('canvas')
  canvas.width = GROUND_MOTTLE_SIZE
  canvas.height = GROUND_MOTTLE_SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Failed to create ground mottle context.')

  ctx.fillStyle = GROUND_MOTTLE_BASE
  ctx.fillRect(0, 0, GROUND_MOTTLE_SIZE, GROUND_MOTTLE_SIZE)

  // Large soft blotches — painterly meadow patches like Genshin's
  // hand-textured fields: wide, low-contrast colour regions, not noise.
  let seed = 137
  const rand = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648
    return seed / 2147483648
  }
  for (let i = 0; i < 170; i++) {
    const x = rand() * GROUND_MOTTLE_SIZE
    const y = rand() * GROUND_MOTTLE_SIZE
    const radius = 22 + rand() * 95
    const color =
      GROUND_MOTTLE_BLOTCHES[Math.floor(rand() * GROUND_MOTTLE_BLOTCHES.length)]!
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius)
    gradient.addColorStop(0, color)
    gradient.addColorStop(1, `${color.slice(0, -1)},0)`)
    ctx.globalAlpha = 0.1 + rand() * 0.12
    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.ellipse(x, y, radius, radius * (0.55 + rand() * 0.45), rand() * Math.PI, 0, Math.PI * 2)
    ctx.fill()
  }

  // Fine speckle — grain/tooth so flat regions don't look vector-clean.
  ctx.globalAlpha = 0.22
  for (let i = 0; i < 3200; i++) {
    ctx.fillStyle = GROUND_MOTTLE_SPECKLE[Math.floor(rand() * 2)]!
    ctx.fillRect(
      rand() * GROUND_MOTTLE_SIZE,
      rand() * GROUND_MOTTLE_SIZE,
      1,
      1,
    )
  }

  ctx.globalAlpha = 1
  return canvas
}

// Each caller gets its own texture over the shared canvas: repeat/offset are
// per-texture state, and the caller disposes its clone with its material.
export const createGroundMottleTexture = (): CanvasTexture => {
  if (!groundMottleCanvas) groundMottleCanvas = drawGroundMottleCanvas()
  const texture = new CanvasTexture(groundMottleCanvas)
  texture.colorSpace = SRGBColorSpace
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.minFilter = LinearMipmapLinearFilter
  texture.magFilter = LinearFilter
  return texture
}

// Screen-space sky backdrop: a vertical gradient texture used as
// scene.background — the painterly sky behind the board.
export const createSkyGradientTexture = (
  topColor: string,
  horizonColor: string,
): CanvasTexture => {
  const canvas = document.createElement('canvas')
  canvas.width = 2
  canvas.height = 256
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Failed to create sky texture context.')

  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height)
  gradient.addColorStop(0, topColor)
  gradient.addColorStop(1, horizonColor)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.minFilter = LinearFilter
  texture.magFilter = LinearFilter
  return texture
}

export const createShadowTexture = (): CanvasTexture => {
  const canvas = document.createElement('canvas')
  canvas.width = SHADOW_TEXTURE_SIZE
  canvas.height = SHADOW_TEXTURE_SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Failed to create shadow texture context.')

  const gradient = ctx.createRadialGradient(
    SHADOW_TEXTURE_CENTER,
    SHADOW_TEXTURE_CENTER,
    SHADOW_TEXTURE_INNER_RADIUS,
    SHADOW_TEXTURE_CENTER,
    SHADOW_TEXTURE_CENTER,
    SHADOW_TEXTURE_OUTER_RADIUS,
  )
  gradient.addColorStop(0, SHADOW_TEXTURE_STOP_0)
  gradient.addColorStop(
    SHADOW_TEXTURE_STOP_1_AT,
    SHADOW_TEXTURE_STOP_1,
  )
  gradient.addColorStop(1, SHADOW_TEXTURE_STOP_2)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.minFilter = LinearFilter
  texture.magFilter = LinearFilter
  return texture
}

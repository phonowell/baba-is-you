import {
  CanvasTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  NearestFilter,
  SRGBColorSpace,
} from 'three'

import {
  BOARD3D_CARD_TEXTURE_CONFIG,
  BOARD3D_SHADOW_TEXTURE_CONFIG,
} from './board-3d-config-textures.js'
import { BOARD3D_RULE_VISUAL_CONFIG } from './board-3d-config-visuals.js'
import { orientedSpriteForSpec } from './board-3d-shared-item.js'
import {
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

import type { Direction } from '../logic/types.js'
import type { CardSpec } from './board-3d-shared-types.js'
import type { PixelSprite } from './pixel-sprites/types.js'

const {
  CARD_TEXTURE_SIZE,
  CARD_TEXTURE_PAD_RATIO,
  CARD_TEXTURE_CORNER_RADIUS_RATIO,
  CARD_TEXTURE_EMOJI_FONT_RATIO,
  CARD_TEXTURE_TEXT_LONG_THRESHOLD,
  CARD_TEXTURE_TEXT_MEDIUM_THRESHOLD,
  CARD_TEXTURE_TEXT_LONG_FONT_SIZE,
  CARD_TEXTURE_TEXT_MEDIUM_FONT_SIZE,
  CARD_TEXTURE_TEXT_SHORT_FONT_SIZE,
  CARD_TEXTURE_LABEL_OFFSET_Y,
  CARD_TEXTURE_TEXT_STROKE_WIDTH_RATIO,
  CARD_TEXTURE_EMOJI_FONT_FAMILY,
  CARD_TEXTURE_TEXT_FONT_FAMILY,
  CARD_TEXTURE_DIRECTION_FONT_RATIO,
  CARD_TEXTURE_DIRECTION_EDGE_INSET_RATIO,
  CARD_TEXTURE_DIRECTION_OFFSET_Y,
  EMOJI_CARD_TEXTURE_SIZE,
} = BOARD3D_CARD_TEXTURE_CONFIG

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

const { HAS_EMOJI } = BOARD3D_RULE_VISUAL_CONFIG

const roundRectPath = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void => {
  const clamped = Math.min(radius, width / 2, height / 2)
  ctx.beginPath()
  ctx.moveTo(x + clamped, y)
  ctx.lineTo(x + width - clamped, y)
  ctx.quadraticCurveTo(x + width, y, x + width, y + clamped)
  ctx.lineTo(x + width, y + height - clamped)
  ctx.quadraticCurveTo(x + width, y + height, x + width - clamped, y + height)
  ctx.lineTo(x + clamped, y + height)
  ctx.quadraticCurveTo(x, y + height, x, y + height - clamped)
  ctx.lineTo(x, y + clamped)
  ctx.quadraticCurveTo(x, y, x + clamped, y)
  ctx.closePath()
}

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

export const createCardTexture = (spec: CardSpec, anisotropy: number): CanvasTexture => {
  const textureSize = spec.isEmojiLabel ? EMOJI_CARD_TEXTURE_SIZE : CARD_TEXTURE_SIZE
  const canvas = document.createElement('canvas')
  canvas.width = textureSize
  canvas.height = textureSize
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Failed to create card texture context.')

  const pad = textureSize * CARD_TEXTURE_PAD_RATIO
  const size = textureSize - pad * 2
  const radius = textureSize * CARD_TEXTURE_CORNER_RADIUS_RATIO

  ctx.clearRect(0, 0, textureSize, textureSize)
  if (!spec.isEmojiLabel) {
    roundRectPath(ctx, pad, pad, size, size, radius)
    ctx.fillStyle = spec.background
    ctx.fill()
  }

  const labelLength = [...spec.label].length
  const isEmojiLabel = spec.isEmojiLabel || HAS_EMOJI.test(spec.label)
  const fontSize = isEmojiLabel
    ? Math.round(textureSize * CARD_TEXTURE_EMOJI_FONT_RATIO)
    : labelLength >= CARD_TEXTURE_TEXT_LONG_THRESHOLD
      ? CARD_TEXTURE_TEXT_LONG_FONT_SIZE
      : labelLength >= CARD_TEXTURE_TEXT_MEDIUM_THRESHOLD
        ? CARD_TEXTURE_TEXT_MEDIUM_FONT_SIZE
        : CARD_TEXTURE_TEXT_SHORT_FONT_SIZE

  const labelOffsetY = isEmojiLabel ? 0 : CARD_TEXTURE_LABEL_OFFSET_Y
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = spec.textColor
  ctx.font = isEmojiLabel
    ? `${fontSize}px ${CARD_TEXTURE_EMOJI_FONT_FAMILY}`
    : `700 ${fontSize}px ${CARD_TEXTURE_TEXT_FONT_FAMILY}`

  if (!isEmojiLabel) {
    ctx.lineWidth = textureSize * CARD_TEXTURE_TEXT_STROKE_WIDTH_RATIO
    ctx.lineJoin = 'round'
    ctx.strokeStyle = spec.outlineColor
    ctx.strokeText(spec.label, textureSize / 2, textureSize / 2 + labelOffsetY)
  }
  ctx.fillText(spec.label, textureSize / 2, textureSize / 2 + labelOffsetY)

  if (spec.strikethrough) {
    const strikeY = textureSize / 2 + labelOffsetY
    const strikeHalf = Math.min(size / 2, fontSize * spec.label.length * 0.36)
    ctx.strokeStyle = spec.strikeColor ?? spec.textColor
    ctx.lineWidth = Math.max(2, textureSize * 0.02)
    ctx.beginPath()
    ctx.moveTo(textureSize / 2 - strikeHalf, strikeY)
    ctx.lineTo(textureSize / 2 + strikeHalf, strikeY)
    ctx.stroke()
  }

  if (spec.facingDirection) {
    drawDirectionArrow(ctx, spec.facingDirection, pad, textureSize)
  }

  return createCanvasTexture(canvas, anisotropy, false)
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

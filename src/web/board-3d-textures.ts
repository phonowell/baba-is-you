import { CanvasTexture, LinearFilter, SRGBColorSpace } from 'three'

import {
  BOARD3D_CARD_TEXTURE_CONFIG,
  BOARD3D_SHADOW_TEXTURE_CONFIG,
  BOARD3D_RULE_VISUAL_CONFIG,
} from './board-3d-config.js'
import { BELT_DIRECTION_GLYPHS, type CardSpec } from './board-3d-shared.js'

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

  if (spec.facingDirection) {
    const marker = BELT_DIRECTION_GLYPHS[spec.facingDirection]
    const markerFontSize = Math.round(textureSize * CARD_TEXTURE_DIRECTION_FONT_RATIO)
    const edgeInset = pad + textureSize * CARD_TEXTURE_DIRECTION_EDGE_INSET_RATIO
    const center = textureSize / 2
    const markerX =
      spec.facingDirection === 'left'
        ? edgeInset
        : spec.facingDirection === 'right'
          ? textureSize - edgeInset
          : center
    const markerY =
      spec.facingDirection === 'up'
        ? edgeInset
        : spec.facingDirection === 'down'
          ? textureSize - edgeInset
          : center
    ctx.font = `${markerFontSize}px ${CARD_TEXTURE_EMOJI_FONT_FAMILY}`
    ctx.fillText(marker, markerX, markerY + CARD_TEXTURE_DIRECTION_OFFSET_Y)
  }

  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.minFilter = LinearFilter
  texture.magFilter = LinearFilter
  texture.anisotropy = anisotropy
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

import {
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  DoubleSide,
  FogExp2,
  Group,
  LinearFilter,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  Points,
  PointsMaterial,
  RepeatWrapping,
  Scene,
  Shape,
  ShapeGeometry,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three'
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'

import {
  CLAY_PRESET,
  createClayObjectPalette,
  readabilityMix,
  selectClayCameraTier,
} from './clay-config.js'
import { OBJECT_GLYPHS } from '../view/render-config.js'
import {
  STACK_LAYER_PRIORITY,
  isGroundHugItem,
  sortGroundStack,
  sortUprightStack,
  stackLayerPriorityForItem,
} from '../view/stack-policy.js'
import { SYNTAX_WORDS } from '../view/syntax-words.js'

import type { OrthographicCamera } from 'three'
import type { Direction, GameState, Item, Property } from '../logic/types.js'

type Board3dRenderer = {
  isSupported: boolean
  mount: (container: HTMLElement) => void
  sync: (state: GameState) => void
  dispose: () => void
}

type CardSpec = {
  key: string
  label: string
  facingDirection: Direction | null
  isEmojiLabel: boolean
  background: string
  border: string
  textColor: string
  outlineColor: string
}

export type EntityView = {
  item: Item
  stackIndex: number
  stackCount: number
  displayStackIndex: number
  displayStackCount: number
  layerPriority: number
}

type CardMaterial = MeshStandardMaterial | MeshBasicMaterial

type EntityNode = {
  mesh: Mesh<PlaneGeometry, CardMaterial>
  shadow: Mesh<PlaneGeometry, MeshBasicMaterial>
  shadowMaterial: MeshBasicMaterial
  isEmoji: boolean
  emojiPhaseOffsetMs: number
  rotX: number
  rotRoll: number
  rollStep: number
  fromX: number
  fromY: number
  fromBaseZ: number
  fromRoll: number
  toX: number
  toY: number
  toBaseZ: number
  toRoll: number
  animStartMs: number
  animDurationMs: number
  moving: boolean
  spawnStartMs: number | null
  despawnStartMs: number | null
  landStartMs: number | null
}

type BokehUniform = {
  value: number
}

type PoseStepResult = {
  animating: boolean
  finishedLeaving: boolean
}

const CARD_TEXTURE_SIZE = 256
const EMOJI_CARD_TEXTURE_SIZE = 512
const CARD_WORLD_SIZE = 0.88
const CARD_STACK_DEPTH = 0.05
const CARD_STACK_LATERAL_SPREAD = 0.06
const CARD_STACK_DEPTH_SPREAD = 0.06
const CARD_BASE_Z = 0.09
const CARD_LAYER_DEPTH = 0.045
const GROUND_SURFACE_Z = -0.22
const GROUND_ACTIVE_FILL_Z = GROUND_SURFACE_Z + 0.0008
const GROUND_HUG_BASE_Z = GROUND_SURFACE_Z + 0.001
const GROUND_HUG_STACK_DEPTH = 0.001
const FLOAT_ITEM_LIFT_Z = 0.14
const SHADOW_BASE_Z = -0.08
const SHADOW_MAP_SIZE_SCALE = 1.25
const SHADOW_RADIUS = 1.0
const LIGHT_HEIGHT_Y_BASE = 9.2
const LIGHT_HEIGHT_Y_SPAN_MUL = 0.84
const SIDE_LIGHT_OFFSET_X_BASE = 3.4
const SIDE_LIGHT_OFFSET_X_MUL = 0.36
const SIDE_LIGHT_OFFSET_Z_BASE = 2.4
const SIDE_LIGHT_OFFSET_Z_MUL = 0.28
const SHADOW_FRUSTUM_BASE = 2.1
const SHADOW_FRUSTUM_SPAN_MUL = 0.62
const SHADOW_FAR_PADDING = 8
const SHADOW_FRUSTUM_DISTANCE_SCALE = 2
const SHADOW_ANGLE_SPAN_BOOST = 0.35
const GROUND_EXPANDED_MIN_SIZE = 220
const GROUND_TEXTURE_TILE_SIZE = 16
const PLAY_AREA_OUTLINE_Z = -0.065
const PLAY_AREA_OUTLINE_RADIUS = 0.34
const PLAY_AREA_OUTLINE_OPACITY = 0.88
const ATMOSPHERE_FOG_COLOR = '#e8ecea'
const ATMOSPHERE_FOG_DENSITY = 0.022
const DUST_PARTICLE_COUNT = 260
const DUST_SPREAD_BASE = 4.4
const DUST_SPREAD_MUL = 0.62
const DUST_HEIGHT_BASE = 1.9
const DUST_HEIGHT_MUL = 0.24
const DUST_LAYER_DEPTH_SCALE = 0.8
const DUST_PARTICLE_SIZE = 0.18
const DUST_PARTICLE_OPACITY = 0.2
const MAX_DEVICE_PIXEL_RATIO = 1.4
const POSTFX_PIXEL_RATIO_SCALE = 1
const BLOOM_RESOLUTION_SCALE = 0.65
const BLOOM_DENSE_TEXT_RESOLUTION_SCALE = 0.84
const BOKEH_ENABLE_MARGIN = 1.12
const CAMERA_CARD_FACE_ANGLE_RAD = Math.PI / 4
const CAMERA_PITCH_RAD = CAMERA_CARD_FACE_ANGLE_RAD
const CAMERA_DISTANCE_SCALE = 0.56
const CAMERA_DISTANCE_MIN = 1.45
const CAMERA_LOOK_AT_OFFSET_Y = -0.58
const CAMERA_LOOK_AT_DEPTH_BIAS = 0.14
const LIGHT_CAMERA_SIDE_TILT_RAD = CAMERA_CARD_FACE_ANGLE_RAD
const MOVE_ANIM_MS = 170
const SPAWN_ANIM_MS = 140
const DESPAWN_ANIM_MS = 120
const SPAWN_SCALE_FROM = 0.66
const DESPAWN_SCALE_TO = 0.12
const LAND_PULSE_MS = 125
const JUMP_HEIGHT = 0.17
const CARD_UPRIGHT_ROT_X = Math.PI / 2
const CARD_BACK_TILT_RAD = CAMERA_CARD_FACE_ANGLE_RAD
const CARD_FLAT_ROT_X = 0
const EMOJI_MICRO_STRETCH_CYCLE_MS = 1000
const EMOJI_MICRO_STRETCH_Y_AMP = 0.035
const EMOJI_MICRO_STRETCH_X_AMP = 0.014
const BELT_DIRECTION_GLYPHS: Record<Direction, string> = {
  up: '⬆️',
  right: '➡️',
  down: '⬇️',
  left: '⬅️',
}
const FACING_ARROW_PROPS = new Set<Property>(['you', 'move', 'shift'])
const HAS_EMOJI = /\p{Extended_Pictographic}/u

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value))

const lerp = (from: number, to: number, t: number): number => from + (to - from) * t

const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3

const fnv1a = (value: string): number => {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

const fract = (value: number): number => value - Math.floor(value)

const hash01 = (seed: number): number => fract(Math.sin(seed) * 43758.5453123)

const hash2d01 = (x: number, y: number): number =>
  fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453123)

export const emojiMicroStretch = (
  nowMs: number,
): { scaleX: number; scaleY: number } => {
  const phase =
    ((nowMs % EMOJI_MICRO_STRETCH_CYCLE_MS) / EMOJI_MICRO_STRETCH_CYCLE_MS) *
    Math.PI *
    2
  const wave = Math.sin(phase)
  return {
    scaleX: 1 - wave * EMOJI_MICRO_STRETCH_X_AMP,
    scaleY: 1 + wave * EMOJI_MICRO_STRETCH_Y_AMP,
  }
}

export const emojiBottomAnchorOffset = (
  baseScaleY: number,
  finalScaleY: number,
): number => (finalScaleY - baseScaleY) * CARD_WORLD_SIZE * 0.5

export const emojiStretchEnabledForItem = (item: Item): boolean =>
  isEmojiItem(item) && !isGroundHugItem(item)

export const emojiPhaseOffsetMsForItem = (item: Item): number =>
  hash01(fnv1a(`emoji-stretch:${item.id}:${item.name}`)) * EMOJI_MICRO_STRETCH_CYCLE_MS

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

const buildRoundedRectOutlinePoints = (
  halfWidth: number,
  halfHeight: number,
  z: number,
): Vector3[] => {
  const shape = buildRoundedRectShape(halfWidth, halfHeight)
  const curveSamples = Math.max(24, Math.round((halfWidth + halfHeight) * 8))
  const points = shape.getPoints(curveSamples).map((point) => new Vector3(point.x, point.y, z))
  const firstPoint = points.at(0)
  if (firstPoint) points.push(firstPoint.clone())
  return points
}

const buildRoundedRectShape = (halfWidth: number, halfHeight: number): Shape => {
  const left = -halfWidth
  const right = halfWidth
  const bottom = -halfHeight
  const top = halfHeight
  const radius = Math.min(PLAY_AREA_OUTLINE_RADIUS, halfWidth * 0.35, halfHeight * 0.35)
  const shape = new Shape()
  if (radius <= 0) {
    shape.moveTo(left, bottom)
    shape.lineTo(right, bottom)
    shape.lineTo(right, top)
    shape.lineTo(left, top)
    shape.lineTo(left, bottom)
    shape.closePath()
    return shape
  }

  shape.moveTo(left + radius, bottom)
  shape.lineTo(right - radius, bottom)
  shape.absarc(right - radius, bottom + radius, radius, -Math.PI / 2, 0, false)
  shape.lineTo(right, top - radius)
  shape.absarc(right - radius, top - radius, radius, 0, Math.PI / 2, false)
  shape.lineTo(left + radius, top)
  shape.absarc(left + radius, top - radius, radius, Math.PI / 2, Math.PI, false)
  shape.lineTo(left, bottom + radius)
  shape.absarc(left + radius, bottom + radius, radius, Math.PI, (Math.PI * 3) / 2, false)
  shape.closePath()
  return shape
}

const objectPalette = (
  name: string,
  minContrastRatio: number,
): { background: string; border: string; textColor: string; outlineColor: string } => {
  const hue = fnv1a(name) % 360
  const palette = createClayObjectPalette(hue, minContrastRatio)
  return palette
}

const rollForMoveStep = (itemId: number, step: number): number => {
  const seed = fnv1a(`${itemId}:${step}`)
  return ((seed & 0xfff) / 0xfff - 0.5) * 0.18
}

const cardRotXForItem = (item: Item): number =>
  isGroundHugItem(item) ? CARD_FLAT_ROT_X : CARD_UPRIGHT_ROT_X - CARD_BACK_TILT_RAD

const cardRollForItemStep = (item: Item, step: number): number =>
  item.isText || isGroundHugItem(item) ? 0 : rollForMoveStep(item.id, step)

const directionFromProps = (item: Item): Direction | null => {
  if (item.props.includes('up')) return 'up'
  if (item.props.includes('right')) return 'right'
  if (item.props.includes('down')) return 'down'
  if (item.props.includes('left')) return 'left'
  return null
}

const facingDirectionForItem = (item: Item): Direction | null => {
  if (item.isText) return null
  if (!item.props.some((prop) => FACING_ARROW_PROPS.has(prop))) return null
  if (item.dir) return item.dir
  const propDirection = directionFromProps(item)
  if (propDirection) return propDirection
  if (item.props.includes('you')) return 'right'
  if (item.props.includes('move')) return 'right'
  if (item.props.includes('shift')) return 'right'
  return null
}

const labelForItem = (item: Item): string => {
  if (item.isText) return item.name.toUpperCase()
  if (item.name === 'belt') return BELT_DIRECTION_GLYPHS[item.dir ?? 'right']
  return OBJECT_GLYPHS[item.name] ?? item.name.slice(0, 2).toUpperCase()
}

const isEmojiItem = (item: Item): boolean => HAS_EMOJI.test(labelForItem(item))

const cardSpecForItem = (item: Item, minContrastRatio: number): CardSpec => {
  const label = labelForItem(item)
  const facingDirection = facingDirectionForItem(item)
  const isEmojiLabel = HAS_EMOJI.test(label)
  if (item.isText) {
    if (SYNTAX_WORDS.has(item.name)) {
      return {
        key: `text:syntax:${item.name}`,
        label,
        facingDirection: null,
        isEmojiLabel: false,
        background: '#f2dca8',
        border: '#c5a24c',
        textColor: '#513c0c',
        outlineColor: '#fff9eb',
      }
    }
    return {
      key: `text:normal:${item.name}`,
      label,
      facingDirection: null,
      isEmojiLabel: false,
      background: '#bfd8f6',
      border: '#6c94c8',
      textColor: '#19324f',
      outlineColor: '#f4f8ff',
    }
  }

  const palette = objectPalette(item.name, minContrastRatio)
  return {
    key: `object:${item.name}:${item.dir ?? 'none'}:${facingDirection ?? 'none'}`,
    label,
    facingDirection,
    isEmojiLabel,
    ...palette,
  }
}

const stackSpreadOffsets = (
  displayStackCount: number,
  displayStackIndex: number,
): { x: number; y: number } => {
  const centered = displayStackIndex - (displayStackCount - 1) / 2
  return {
    x: centered * CARD_STACK_LATERAL_SPREAD,
    y: centered * CARD_STACK_DEPTH_SPREAD,
  }
}

export const computeEntityBaseTarget = (
  state: GameState,
  view: EntityView,
): { x: number; y: number; baseZ: number } => {
  const { item, displayStackCount, displayStackIndex, layerPriority } = view
  const spread = stackSpreadOffsets(displayStackCount, displayStackIndex)
  const x = item.x - (state.width - 1) / 2 + spread.x
  const y = (state.height - 1) / 2 - item.y + spread.y
  const hasStack = displayStackCount > 1
  const floatLift = item.props.includes('float') ? FLOAT_ITEM_LIFT_Z : 0
  const baseZ = isGroundHugItem(item)
    ? GROUND_HUG_BASE_Z + (hasStack ? displayStackIndex * GROUND_HUG_STACK_DEPTH : 0) + floatLift
    : CARD_BASE_Z +
      (hasStack
        ? layerPriority * CARD_LAYER_DEPTH + displayStackIndex * CARD_STACK_DEPTH
        : 0) +
      floatLift
  return { x, y, baseZ }
}

export const buildEntityViews = (state: GameState): EntityView[] => {
  const grid = new Map<number, Item[]>()
  for (const item of state.items) {
    if (item.props.includes('hide')) continue

    const cellId = item.y * state.width + item.x
    const list = grid.get(cellId) ?? []
    list.push(item)
    grid.set(cellId, list)
  }

  const views: EntityView[] = []
  for (const stack of grid.values()) {
    const sortedUpright = sortUprightStack(stack)
    const sortedGround = sortGroundStack(stack)
    const uprightStack = sortedUpright
    const groundStack = sortedGround
    const sorted = [...sortedUpright, ...sortedGround]
    const stackCount = sorted.length
    const uprightStackIndexById = new Map<number, number>()
    const groundStackIndexById = new Map<number, number>()
    for (const [index, item] of sortedUpright.entries()) {
      uprightStackIndexById.set(item.id, index)
    }
    for (const [index, item] of sortedGround.entries()) {
      groundStackIndexById.set(item.id, index)
    }

    for (const [stackIndex, item] of sorted.entries()) {
      const groundHug = isGroundHugItem(item)
      const displayStackCount = groundHug ? groundStack.length : uprightStack.length
      const displayStackIndex = groundHug
        ? groundStackIndexById.get(item.id) ?? 0
        : uprightStackIndexById.get(item.id) ?? 0
      views.push({
        item,
        stackIndex,
        stackCount,
        displayStackIndex,
        displayStackCount,
        layerPriority: groundHug
          ? STACK_LAYER_PRIORITY.other
          : stackLayerPriorityForItem(item),
      })
    }
  }
  return views
}

const createCardTexture = (spec: CardSpec, anisotropy: number): CanvasTexture => {
  const textureSize = spec.isEmojiLabel ? EMOJI_CARD_TEXTURE_SIZE : CARD_TEXTURE_SIZE
  const canvas = document.createElement('canvas')
  canvas.width = textureSize
  canvas.height = textureSize
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Failed to create 2D drawing context.')

  const pad = textureSize * 0.08
  const size = textureSize - pad * 2

  ctx.clearRect(0, 0, textureSize, textureSize)
  ctx.fillStyle = 'rgba(0,0,0,0)'
  ctx.fillRect(0, 0, textureSize, textureSize)

  if (!spec.isEmojiLabel) {
    roundRectPath(ctx, pad + 5, pad + 8, size, size, textureSize * 0.14)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)'
    ctx.fill()

    roundRectPath(ctx, pad, pad, size, size, textureSize * 0.14)
    ctx.fillStyle = spec.background
    ctx.fill()

    ctx.lineWidth = textureSize * 0.03
    ctx.strokeStyle = spec.border
    roundRectPath(ctx, pad + 2, pad + 2, size - 4, size - 4, textureSize * 0.13)
    ctx.stroke()
  }

  const labelLength = [...spec.label].length
  const fontSize = spec.isEmojiLabel
    ? Math.round(textureSize * 0.9)
    : labelLength >= 5
      ? 56
      : labelLength >= 3
        ? 72
        : 96
  const labelOffsetY = spec.isEmojiLabel ? 0 : 4
  ctx.fillStyle = spec.textColor
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = spec.isEmojiLabel
    ? `${fontSize}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`
    : `700 ${fontSize}px "Trebuchet MS","Arial Rounded MT Bold","Segoe UI Emoji",sans-serif`
  if (!spec.isEmojiLabel) {
    ctx.lineWidth = textureSize * 0.05
    ctx.lineJoin = 'round'
    ctx.strokeStyle = spec.outlineColor
    ctx.strokeText(spec.label, textureSize / 2, textureSize / 2 + labelOffsetY)
  }
  ctx.shadowBlur = spec.isEmojiLabel ? 0 : 7
  ctx.shadowColor = spec.isEmojiLabel ? 'rgba(0,0,0,0)' : 'rgba(0,0,0,0.25)'
  ctx.fillText(spec.label, textureSize / 2, textureSize / 2 + labelOffsetY)

  if (spec.facingDirection) {
    const marker = BELT_DIRECTION_GLYPHS[spec.facingDirection]
    const markerFontSize = Math.round(textureSize * 0.36)
    const edgeInset = pad + textureSize * 0.12
    const cx = textureSize / 2
    const cy = textureSize / 2
    const markerX =
      spec.facingDirection === 'left'
        ? edgeInset
        : spec.facingDirection === 'right'
          ? textureSize - edgeInset
          : cx
    const markerY =
      spec.facingDirection === 'up'
        ? edgeInset
        : spec.facingDirection === 'down'
          ? textureSize - edgeInset
          : cy
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = `${markerFontSize}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`
    ctx.shadowBlur = 6
    ctx.shadowColor = 'rgba(255,255,255,0.8)'
    ctx.fillText(marker, markerX, markerY + 1)
  }

  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.minFilter = LinearFilter
  texture.magFilter = LinearFilter
  texture.anisotropy = anisotropy
  return texture
}

const createGroundTexture = (): CanvasTexture => {
  const canvas = document.createElement('canvas')
  canvas.width = 192
  canvas.height = 192
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Failed to create ground texture context.')

  ctx.fillStyle = '#e9eef3'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  const wash = ctx.createLinearGradient(0, 0, canvas.width, canvas.height)
  wash.addColorStop(0, 'rgba(255,255,255,0.1)')
  wash.addColorStop(0.5, 'rgba(236,243,248,0.2)')
  wash.addColorStop(1, 'rgba(211,221,230,0.14)')
  ctx.fillStyle = wash
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const pixels = imageData.data
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const index = (y * canvas.width + x) * 4
      const grain = (hash2d01(x, y) - 0.5) * 16
      const cloud = (hash2d01(x * 0.27 + 13, y * 0.27 + 23) - 0.5) * 11
      const warm = (hash2d01(x * 0.16 + 41, y * 0.16 + 7) - 0.5) * 6
      const r = pixels[index + 0] ?? 0
      const g = pixels[index + 1] ?? 0
      const b = pixels[index + 2] ?? 0
      pixels[index + 0] = Math.max(0, Math.min(255, Math.round(r + grain + cloud)))
      pixels[index + 1] = Math.max(
        0,
        Math.min(255, Math.round(g + grain * 0.85 + cloud * 0.6 + warm)),
      )
      pixels[index + 2] = Math.max(0, Math.min(255, Math.round(b + grain * 0.65 - warm)))
    }
  }
  ctx.putImageData(imageData, 0, 0)

  for (let i = 0; i < 220; i += 1) {
    const seed = i + 1
    const x = hash01(seed * 17.1) * canvas.width
    const y = hash01(seed * 31.7) * canvas.height
    const radius = 0.45 + hash01(seed * 5.3) * 1.8
    const alpha = 0.01 + hash01(seed * 9.2) * 0.025
    ctx.beginPath()
    ctx.fillStyle = `rgba(255,255,255,${alpha})`
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.fill()
  }

  for (let i = 0; i < 120; i += 1) {
    const seed = i + 1
    const x = hash01(seed * 63.2) * canvas.width
    const y = hash01(seed * 27.4) * canvas.height
    const length = 5 + hash01(seed * 11.8) * 11
    const angle = hash01(seed * 3.6) * Math.PI * 2
    const alpha = 0.018 + hash01(seed * 7.9) * 0.022
    ctx.lineWidth = 0.5 + hash01(seed * 19.3) * 0.7
    ctx.strokeStyle = `rgba(132,148,164,${alpha})`
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length)
    ctx.stroke()
  }

  const texture = new CanvasTexture(canvas)
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.colorSpace = SRGBColorSpace
  texture.minFilter = LinearFilter
  texture.magFilter = LinearFilter
  return texture
}

const createDustTexture = (): CanvasTexture => {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Failed to create dust texture context.')

  const gradient = ctx.createRadialGradient(32, 32, 4, 32, 32, 31)
  gradient.addColorStop(0, 'rgba(255,255,255,0.92)')
  gradient.addColorStop(0.4, 'rgba(248,245,236,0.5)')
  gradient.addColorStop(1, 'rgba(248,245,236,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.minFilter = LinearFilter
  texture.magFilter = LinearFilter
  return texture
}

const createDustLayer = (): {
  points: Points<BufferGeometry, PointsMaterial>
  geometry: BufferGeometry
  material: PointsMaterial
  texture: CanvasTexture
} => {
  const positions = new Float32Array(DUST_PARTICLE_COUNT * 3)
  for (let index = 0; index < DUST_PARTICLE_COUNT; index += 1) {
    const seed = index + 1
    const angle = hash01(seed * 11.3) * Math.PI * 2
    const radius = Math.sqrt(hash01(seed * 37.7))
    const height = Math.pow(hash01(seed * 71.9), 0.72)
    positions[index * 3 + 0] = Math.cos(angle) * radius
    positions[index * 3 + 1] = height
    positions[index * 3 + 2] = Math.sin(angle) * radius
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  const texture = createDustTexture()
  const material = new PointsMaterial({
    map: texture,
    color: new Color('#f8f2e6'),
    size: DUST_PARTICLE_SIZE,
    transparent: true,
    opacity: DUST_PARTICLE_OPACITY,
    alphaTest: 0.01,
    depthWrite: false,
    sizeAttenuation: true,
  })
  const points = new Points(geometry, material)
  points.position.set(0, 0.32, 0)
  return { points, geometry, material, texture }
}

const createShadowTexture = (): CanvasTexture => {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Failed to create shadow texture context.')

  const gradient = ctx.createRadialGradient(64, 64, 17, 64, 64, 50)
  gradient.addColorStop(0, 'rgba(0, 0, 0, 0.25)')
  gradient.addColorStop(0.48, 'rgba(0, 0, 0, 0.09)')
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 128, 128)

  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.minFilter = LinearFilter
  texture.magFilter = LinearFilter
  return texture
}

const createNoopRenderer = (): Board3dRenderer => ({
  isSupported: false,
  mount: () => {},
  sync: () => {},
  dispose: () => {},
})

const createBoard3dRendererUnsafe = (): Board3dRenderer => {
  const preset = CLAY_PRESET
  const initialCameraTier = selectClayCameraTier(1, 1)
  const scene = new Scene()
  scene.background = new Color(preset.sceneBackground)
  scene.fog = new FogExp2(ATMOSPHERE_FOG_COLOR, ATMOSPHERE_FOG_DENSITY)
  const camera = new PerspectiveCamera(initialCameraTier.fov, 1, 0.1, 180)
  const renderer = new WebGLRenderer({
    antialias: false,
    alpha: false,
    powerPreference: 'high-performance',
  })
  renderer.outputColorSpace = SRGBColorSpace
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = PCFSoftShadowMap
  renderer.domElement.className = 'board-3d-canvas'
  renderer.domElement.setAttribute('aria-hidden', 'true')

  const composer = new EffectComposer(renderer)
  const renderPass = new RenderPass(scene, camera)
  const bloomPass = new UnrealBloomPass(
    new Vector2(1, 1),
    preset.bloom.strength,
    preset.bloom.radius,
    preset.bloom.threshold,
  )
  const bokehPass = new BokehPass(scene, camera, {
    focus: 10,
    aperture: preset.bokeh.aperture,
    maxblur: preset.bokeh.maxBlur,
  })
  composer.addPass(renderPass)
  composer.addPass(bloomPass)
  composer.addPass(bokehPass)

  const ambientLight = new AmbientLight(
    '#f3f5ff',
    preset.lighting.ambientIntensity * 1.135,
  )
  scene.add(ambientLight)

  const sideLightIntensity = Math.max(0.67, preset.lighting.topLightIntensity * 0.9125)
  const shadowMapSize = Math.max(
    preset.lighting.topLightShadowMapSize,
    Math.round(preset.lighting.topLightShadowMapSize * SHADOW_MAP_SIZE_SCALE),
  )
  const leftLight = new DirectionalLight(
    preset.lighting.topLightColor,
    sideLightIntensity,
  )
  leftLight.position.set(0, 10, 6)
  leftLight.castShadow = true
  leftLight.shadow.mapSize.width = shadowMapSize
  leftLight.shadow.mapSize.height = shadowMapSize
  leftLight.shadow.camera.near = 0.1
  leftLight.shadow.camera.far = preset.lighting.topLightShadowFar
  leftLight.shadow.bias = -0.00006
  leftLight.shadow.normalBias = 0.04
  leftLight.shadow.radius = SHADOW_RADIUS
  scene.add(leftLight)
  scene.add(leftLight.target)

  const rightLight = new DirectionalLight(preset.lighting.topLightColor, sideLightIntensity)
  rightLight.castShadow = true
  rightLight.shadow.mapSize.width = shadowMapSize
  rightLight.shadow.mapSize.height = shadowMapSize
  rightLight.shadow.camera.near = 0.1
  rightLight.shadow.camera.far = preset.lighting.topLightShadowFar
  rightLight.shadow.bias = -0.00006
  rightLight.shadow.normalBias = 0.04
  rightLight.shadow.radius = SHADOW_RADIUS
  scene.add(rightLight)
  scene.add(rightLight.target)

  const world = new Group()
  world.rotation.x = -Math.PI / 2
  scene.add(world)
  const entityGroup = new Group()
  world.add(entityGroup)

  const cardGeometry = new PlaneGeometry(CARD_WORLD_SIZE, CARD_WORLD_SIZE)
  const shadowGeometry = new PlaneGeometry(1, 1)
  const textureCache = new Map<string, CanvasTexture>()
  const materialCache = new Map<string, CardMaterial>()
  const nodes = new Map<number, EntityNode>()
  const shadowTexture = createShadowTexture()
  const dustLayer = createDustLayer()
  scene.add(dustLayer.points)
  const textureAnisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy())

  let container: HTMLElement | null = null
  let viewportWidth = 0
  let viewportHeight = 0
  let devicePixelRatio = 1
  let boardWidth = 0
  let boardHeight = 0
  let groundMesh: Mesh<PlaneGeometry, MeshStandardMaterial> | null = null
  let playAreaFillMesh: Mesh<ShapeGeometry, MeshStandardMaterial> | null = null
  let playAreaOutline: Line<BufferGeometry, LineBasicMaterial> | null = null
  let groundTexture: CanvasTexture | null = null
  let rafId = 0
  let frameActive = false
  let needsRender = true
  let activeBokehAperture = preset.bokeh.aperture
  let activeBokehMaxBlur = preset.bokeh.maxBlur
  let currentReadabilityMix = 0

  const updateDustLayer = (): void => {
    const span = Math.max(1, boardWidth, boardHeight)
    const spread = DUST_SPREAD_BASE + span * DUST_SPREAD_MUL
    const height = DUST_HEIGHT_BASE + span * DUST_HEIGHT_MUL
    dustLayer.points.scale.set(spread, height, spread * DUST_LAYER_DEPTH_SCALE)
  }

  const updateBloomResolution = (): void => {
    if (viewportWidth <= 0 || viewportHeight <= 0) return
    const readabilityScale = lerp(1, BLOOM_DENSE_TEXT_RESOLUTION_SCALE, currentReadabilityMix)
    bloomPass.resolution.set(
      Math.max(1, Math.floor(viewportWidth * BLOOM_RESOLUTION_SCALE * readabilityScale)),
      Math.max(1, Math.floor(viewportHeight * BLOOM_RESOLUTION_SCALE * readabilityScale)),
    )
  }

  const getMaterial = (item: Item): CardMaterial => {
    const spec = cardSpecForItem(item, preset.readability.minContrastRatio)
    const cached = materialCache.get(spec.key)
    if (cached) return cached

    let texture = textureCache.get(spec.key)
    if (!texture) {
      texture = createCardTexture(spec, textureAnisotropy)
      textureCache.set(spec.key, texture)
    }

    const material = spec.isEmojiLabel
      ? new MeshBasicMaterial({
          map: texture,
          transparent: true,
          alphaTest: 0.08,
          fog: true,
          side: DoubleSide,
        })
      : new MeshStandardMaterial({
          map: texture,
          transparent: true,
          alphaTest: 0.08,
          roughness: 0.78,
          metalness: 0.02,
          emissive: new Color('#101019'),
          emissiveIntensity: item.isText
            ? preset.materials.textEmissiveIntensity
            : preset.materials.objectEmissiveIntensity,
          fog: true,
          side: DoubleSide,
        })
    materialCache.set(spec.key, material)
    return material
  }

  const updateBokehFocus = (): void => {
    const uniforms = bokehPass.materialBokeh.uniforms as Record<string, BokehUniform>
    const focus = Math.max(
      4,
      camera.position.z - CARD_BASE_Z + preset.bokeh.focusOffset,
    )
    if (uniforms.focus) uniforms.focus.value = focus
    if (uniforms.aperture) uniforms.aperture.value = activeBokehAperture
    if (uniforms.maxblur) uniforms.maxblur.value = activeBokehMaxBlur
    if (uniforms.aspect) uniforms.aspect.value = viewportWidth / Math.max(1, viewportHeight)
  }

  const updateLightShadowCamera = (
    light: DirectionalLight,
    span: number,
    far: number,
  ): void => {
    const shadowCamera = light.shadow.camera as OrthographicCamera
    shadowCamera.left = -span
    shadowCamera.right = span
    shadowCamera.top = span
    shadowCamera.bottom = -span
    shadowCamera.far = far
    shadowCamera.updateProjectionMatrix()
    light.shadow.needsUpdate = true
  }

  const updateLightRig = (): void => {
    const width = Math.max(1, boardWidth)
    const height = Math.max(1, boardHeight)
    const span = Math.max(width, height)
    const topHeightY = Math.max(LIGHT_HEIGHT_Y_BASE, span * LIGHT_HEIGHT_Y_SPAN_MUL + 4.6)
    const sideOffsetX = width * SIDE_LIGHT_OFFSET_X_MUL + SIDE_LIGHT_OFFSET_X_BASE
    const sideOffsetZ = Math.max(SIDE_LIGHT_OFFSET_Z_BASE, height * SIDE_LIGHT_OFFSET_Z_MUL)
    const targetZ = height * CAMERA_LOOK_AT_DEPTH_BIAS
    const lightDropY = Math.max(0.5, topHeightY - 0.08)
    const lightDepthOffset = Math.tan(LIGHT_CAMERA_SIDE_TILT_RAD) * lightDropY
    const lightZ = Math.max(sideOffsetZ, targetZ + lightDepthOffset)
    const lightToTargetDistance = Math.hypot(sideOffsetX, lightDropY, lightZ - targetZ)
    const baseShadowSpan = span * SHADOW_FRUSTUM_SPAN_MUL + SHADOW_FRUSTUM_BASE
    const tiltRatio = Math.abs(lightZ - targetZ) / Math.max(1, lightDropY)
    const shadowSpan = baseShadowSpan * (1 + tiltRatio * SHADOW_ANGLE_SPAN_BOOST)
    const shadowFar = Math.max(
      preset.lighting.topLightShadowFar,
      lightToTargetDistance + shadowSpan * SHADOW_FRUSTUM_DISTANCE_SCALE + SHADOW_FAR_PADDING,
    )

    leftLight.position.set(-sideOffsetX, topHeightY, lightZ)
    leftLight.target.position.set(0, 0.08, targetZ)
    leftLight.target.updateMatrixWorld()

    rightLight.position.set(sideOffsetX, topHeightY, lightZ)
    rightLight.target.position.set(0, 0.08, targetZ)
    rightLight.target.updateMatrixWorld()

    if (leftLight.castShadow) updateLightShadowCamera(leftLight, shadowSpan, shadowFar)
    if (rightLight.castShadow) updateLightShadowCamera(rightLight, shadowSpan, shadowFar)
  }

  const updateCamera = (): void => {
    if (!container || viewportWidth === 0 || viewportHeight === 0) return

    const width = Math.max(1, boardWidth)
    const height = Math.max(1, boardHeight)
    const cameraTier = selectClayCameraTier(width, height)
    const aspect = viewportWidth / viewportHeight
    const spanX = width + cameraTier.spanPadding
    const spanY = height + cameraTier.spanPadding
    camera.fov = cameraTier.fov
    const halfFov = (camera.fov * Math.PI) / 360
    const distByHeight = spanY / (2 * Math.tan(halfFov))
    const distByWidth = spanX / (2 * Math.tan(halfFov) * aspect)
    const framingDistance =
      Math.max(distByWidth, distByHeight) + cameraTier.distancePadding
    const distance = Math.max(CAMERA_DISTANCE_MIN, framingDistance * CAMERA_DISTANCE_SCALE)

    const lookAtY = cameraTier.lookAtY + CAMERA_LOOK_AT_OFFSET_Y
    const lookAtZ = height * CAMERA_LOOK_AT_DEPTH_BIAS
    const cameraHeight = lookAtY + Math.tan(CAMERA_PITCH_RAD) * distance

    camera.aspect = aspect
    camera.position.set(0, cameraHeight, distance)
    camera.lookAt(0, lookAtY, lookAtZ)
    camera.updateProjectionMatrix()
    updateLightRig()
    updateDustLayer()
    updateBokehFocus()
  }

  const updateViewport = (): boolean => {
    if (!container) return false

    const nextWidth = Math.max(1, Math.floor(container.clientWidth))
    const nextHeight = Math.max(1, Math.floor(container.clientHeight))
    const nextRatio = Math.min(MAX_DEVICE_PIXEL_RATIO, window.devicePixelRatio || 1)
    if (
      nextWidth === viewportWidth &&
      nextHeight === viewportHeight &&
      nextRatio === devicePixelRatio
    )
      return false

    viewportWidth = nextWidth
    viewportHeight = nextHeight
    devicePixelRatio = nextRatio
    const postFxPixelRatio = Math.max(1, devicePixelRatio * POSTFX_PIXEL_RATIO_SCALE)
    renderer.setPixelRatio(devicePixelRatio)
    renderer.setSize(viewportWidth, viewportHeight, false)
    composer.setPixelRatio(postFxPixelRatio)
    composer.setSize(viewportWidth, viewportHeight)
    updateBloomResolution()
    updateCamera()
    return true
  }

  const rebuildGround = (): void => {
    if (playAreaFillMesh) {
      world.remove(playAreaFillMesh)
      playAreaFillMesh.geometry.dispose()
      playAreaFillMesh.material.dispose()
      playAreaFillMesh = null
    }
    if (playAreaOutline) {
      world.remove(playAreaOutline)
      playAreaOutline.geometry.dispose()
      playAreaOutline.material.dispose()
      playAreaOutline = null
    }
    if (groundMesh) {
      world.remove(groundMesh)
      groundMesh.geometry.dispose()
      groundMesh.material.dispose()
      groundMesh = null
    }
    if (groundTexture) {
      groundTexture.dispose()
      groundTexture = null
    }

    const expandedWidth = Math.max(boardWidth + 0.65, GROUND_EXPANDED_MIN_SIZE)
    const expandedHeight = Math.max(boardHeight + 0.65, GROUND_EXPANDED_MIN_SIZE)
    const geometry = new PlaneGeometry(expandedWidth, expandedHeight)
    groundTexture = createGroundTexture()
    groundTexture.repeat.set(
      Math.max(1, expandedWidth / GROUND_TEXTURE_TILE_SIZE),
      Math.max(1, expandedHeight / GROUND_TEXTURE_TILE_SIZE),
    )
    groundTexture.needsUpdate = true
    const material = new MeshStandardMaterial({
      map: groundTexture,
      roughness: 0.66,
      metalness: 0,
    })
    groundMesh = new Mesh(geometry, material)
    groundMesh.position.z = GROUND_SURFACE_Z
    groundMesh.receiveShadow = true
    world.add(groundMesh)

    const halfWidth = boardWidth / 2
    const halfHeight = boardHeight / 2
    const playAreaShape = buildRoundedRectShape(halfWidth, halfHeight)
    const playAreaFillGeometry = new ShapeGeometry(playAreaShape)
    const playAreaFillMaterial = new MeshStandardMaterial({
      color: new Color('#f8fbff'),
      roughness: 0.68,
      metalness: 0,
    })
    playAreaFillMesh = new Mesh(playAreaFillGeometry, playAreaFillMaterial)
    playAreaFillMesh.position.z = GROUND_ACTIVE_FILL_Z
    playAreaFillMesh.receiveShadow = true
    world.add(playAreaFillMesh)

    const outlineGeometry = new BufferGeometry().setFromPoints(
      buildRoundedRectOutlinePoints(halfWidth, halfHeight, PLAY_AREA_OUTLINE_Z),
    )
    const outlineMaterial = new LineBasicMaterial({
      color: new Color('#a6b3c1'),
      transparent: true,
      opacity: PLAY_AREA_OUTLINE_OPACITY,
    })
    playAreaOutline = new Line(outlineGeometry, outlineMaterial)
    world.add(playAreaOutline)
  }

  const createNode = (item: Item, nowMs: number): EntityNode => {
    const rollNoise = cardRollForItemStep(item, 0)

    const mesh = new Mesh(cardGeometry, getMaterial(item))
    const emoji = isEmojiItem(item)
    const stretchEnabled = emojiStretchEnabledForItem(item)
    mesh.castShadow = true
    mesh.receiveShadow = !emoji
    entityGroup.add(mesh)

    const shadowMaterial = new MeshBasicMaterial({
      map: shadowTexture,
      color: new Color('#102038'),
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      alphaTest: 0.01,
      side: DoubleSide,
    })
    const shadow = new Mesh(shadowGeometry, shadowMaterial)
    shadow.position.z = SHADOW_BASE_Z
    shadow.receiveShadow = false
    shadow.castShadow = false
    entityGroup.add(shadow)

    const node: EntityNode = {
      mesh,
      shadow,
      shadowMaterial,
      isEmoji: stretchEnabled,
      emojiPhaseOffsetMs: emojiPhaseOffsetMsForItem(item),
      rotX: cardRotXForItem(item),
      rotRoll: rollNoise,
      rollStep: 0,
      fromX: 0,
      fromY: 0,
      fromBaseZ: CARD_BASE_Z,
      fromRoll: rollNoise,
      toX: 0,
      toY: 0,
      toBaseZ: CARD_BASE_Z,
      toRoll: rollNoise,
      animStartMs: nowMs,
      animDurationMs: MOVE_ANIM_MS,
      moving: false,
      spawnStartMs: nowMs,
      despawnStartMs: null,
      landStartMs: null,
    }
    return node
  }

  const applyNodePose = (node: EntityNode, nowMs: number): PoseStepResult => {
    const animDuration = Math.max(1, node.animDurationMs)
    const rawProgress = clamp01((nowMs - node.animStartMs) / animDuration)
    const eased = easeOutCubic(rawProgress)

    const x = lerp(node.fromX, node.toX, eased)
    const y = lerp(node.fromY, node.toY, eased)
    const baseZ = lerp(node.fromBaseZ, node.toBaseZ, eased)
    const roll = lerp(node.fromRoll, node.toRoll, eased)

    const dx = node.toX - node.fromX
    const dy = node.toY - node.fromY
    const dominantX = Math.abs(dx) >= Math.abs(dy)

    let jump = 0
    let stretchX = 1
    let stretchY = 1
    if (node.moving && node.despawnStartMs === null) {
      const wave = Math.sin(Math.PI * rawProgress)
      jump = wave * JUMP_HEIGHT
      const stretch = 1 + wave * 0.17
      const squash = 1 - wave * 0.14
      stretchX = dominantX ? stretch : squash
      stretchY = dominantX ? squash : stretch
      if (rawProgress >= 1) {
        node.moving = false
        node.landStartMs = nowMs
      }
    }

    let landing = 0
    if (node.landStartMs !== null && node.despawnStartMs === null) {
      const landT = clamp01((nowMs - node.landStartMs) / LAND_PULSE_MS)
      landing = Math.sin((1 - landT) * Math.PI) * 0.04
      if (landT >= 1) node.landStartMs = null
    }

    let scaleFactor = 1
    let verticalOffset = 0
    if (node.spawnStartMs !== null) {
      const spawnT = clamp01((nowMs - node.spawnStartMs) / SPAWN_ANIM_MS)
      scaleFactor *= lerp(SPAWN_SCALE_FROM, 1, easeOutCubic(spawnT))
      verticalOffset += (1 - spawnT) * 0.16
      if (spawnT >= 1) node.spawnStartMs = null
    }

    let finishedLeaving = false
    let shadowOpacityMul = 1
    if (node.despawnStartMs !== null) {
      const despawnT = clamp01((nowMs - node.despawnStartMs) / DESPAWN_ANIM_MS)
      const fade = 1 - easeOutCubic(despawnT)
      scaleFactor *= lerp(1, DESPAWN_SCALE_TO, despawnT)
      shadowOpacityMul = Math.max(0, fade)
      verticalOffset += despawnT * 0.12
      if (despawnT >= 1) finishedLeaving = true
    }

    const baseScaleX = stretchX * scaleFactor
    const baseScaleY = stretchY * scaleFactor
    let scaleX = baseScaleX
    let scaleY = baseScaleY
    if (node.isEmoji) {
      const microStretch = emojiMicroStretch(nowMs + node.emojiPhaseOffsetMs)
      scaleX *= microStretch.scaleX
      scaleY *= microStretch.scaleY
      verticalOffset += emojiBottomAnchorOffset(baseScaleY, scaleY)
    }

    node.mesh.position.set(x, y, baseZ + jump + landing + verticalOffset)
    node.mesh.rotation.set(node.rotX, 0, roll)
    node.mesh.scale.set(scaleX, scaleY, 1)

    const shadowScale = 0.54 + jump * 1.25 + landing * 0.62
    const shadowOpacity = Math.max(0.05, 0.16 - jump * 0.42 + landing * 0.2)
    node.shadow.position.set(x, y, SHADOW_BASE_Z)
    node.shadow.scale.set(shadowScale * scaleFactor, shadowScale * scaleFactor, 1)
    node.shadowMaterial.opacity = shadowOpacity * shadowOpacityMul

    return {
      animating:
        node.moving ||
        node.landStartMs !== null ||
        node.spawnStartMs !== null ||
        node.despawnStartMs !== null ||
        node.isEmoji,
      finishedLeaving,
    }
  }

  const render = (): void => {
    composer.render()
  }

  const removeNode = (id: number): void => {
    const node = nodes.get(id)
    if (!node) return
    entityGroup.remove(node.mesh)
    entityGroup.remove(node.shadow)
    node.shadowMaterial.dispose()
    nodes.delete(id)
  }

  const tick = (nowMs: number): void => {
    frameActive = false
    const viewportChanged = updateViewport()
    let hasAnimation = false
    const leavingDoneIds: number[] = []
    for (const [id, node] of nodes) {
      const step = applyNodePose(node, nowMs)
      if (step.animating) hasAnimation = true
      if (step.finishedLeaving) leavingDoneIds.push(id)
    }
    for (const id of leavingDoneIds) {
      removeNode(id)
    }
    if (needsRender || viewportChanged || hasAnimation) {
      render()
      needsRender = false
    }
    if (hasAnimation && container) {
      frameActive = true
      rafId = window.requestAnimationFrame(tick)
    }
  }

  const ensureFrame = (): void => {
    if (frameActive) return
    frameActive = true
    rafId = window.requestAnimationFrame(tick)
  }

  const syncEntities = (state: GameState): void => {
    const nowMs = performance.now()
    const seen = new Set<number>()
    const views = buildEntityViews(state)

    for (const view of views) {
      const item = view.item
      seen.add(item.id)

      let node = nodes.get(item.id)
      let nodeCreated = false
      if (!node) {
        node = createNode(item, nowMs)
        nodes.set(item.id, node)
        nodeCreated = true
      } else if (node.despawnStartMs !== null) {
        node.despawnStartMs = null
        node.spawnStartMs = nowMs
      }

      const target = computeEntityBaseTarget(state, view)
      const material = getMaterial(item)
      if (node.mesh.material !== material) node.mesh.material = material
      const emoji = isEmojiItem(item)
      node.isEmoji = emojiStretchEnabledForItem(item)
      node.emojiPhaseOffsetMs = emojiPhaseOffsetMsForItem(item)
      node.mesh.castShadow = true
      node.mesh.receiveShadow = !emoji
      node.rotX = cardRotXForItem(item)
      const stableRoll = cardRollForItemStep(item, node.rollStep)
      if (!node.moving && Math.abs(node.rotRoll - stableRoll) > 0.0001) {
        node.rotRoll = stableRoll
        node.fromRoll = stableRoll
        node.toRoll = stableRoll
      }

      if (nodeCreated) {
        node.fromX = target.x
        node.fromY = target.y
        node.fromBaseZ = target.baseZ
        node.fromRoll = node.rotRoll
        node.toX = target.x
        node.toY = target.y
        node.toBaseZ = target.baseZ
        node.toRoll = node.rotRoll
        node.mesh.position.set(target.x, target.y, target.baseZ)
        node.mesh.rotation.set(node.rotX, 0, node.rotRoll)
        node.mesh.scale.set(1, 1, 1)
        node.shadow.position.set(target.x, target.y, SHADOW_BASE_Z)
        node.shadow.scale.set(0.62, 0.62, 1)
        node.shadowMaterial.opacity = 0.16
        continue
      }

      const positionChanged =
        Math.abs(node.toX - target.x) > 0.0001 ||
        Math.abs(node.toY - target.y) > 0.0001 ||
        Math.abs(node.toBaseZ - target.baseZ) > 0.0001

      if (positionChanged) {
        node.fromX = node.mesh.position.x
        node.fromY = node.mesh.position.y
        node.fromBaseZ = node.mesh.position.z
        node.fromRoll = node.mesh.rotation.z
        node.rollStep += 1
        node.rotRoll = cardRollForItemStep(item, node.rollStep)
        node.toX = target.x
        node.toY = target.y
        node.toBaseZ = target.baseZ
        node.toRoll = node.rotRoll
        node.animStartMs = nowMs
        node.animDurationMs = MOVE_ANIM_MS
        node.moving = true
      } else {
        node.toX = target.x
        node.toY = target.y
        node.toBaseZ = target.baseZ
        node.toRoll = node.rotRoll
        if (!node.moving && node.landStartMs === null) {
          node.mesh.position.set(node.toX, node.toY, node.toBaseZ)
          node.mesh.rotation.set(node.rotX, 0, node.toRoll)
          node.mesh.scale.set(1, 1, 1)
          node.shadow.position.set(node.toX, node.toY, SHADOW_BASE_Z)
          node.shadow.scale.set(0.62, 0.62, 1)
          node.shadowMaterial.opacity = 0.16
        }
      }
    }

    for (const [id, node] of nodes) {
      if (!seen.has(id)) {
        if (node.despawnStartMs === null) {
          node.despawnStartMs = nowMs
          node.spawnStartMs = null
          node.moving = false
          node.landStartMs = null
        }
      }
    }
  }

  const applyReadabilityGuard = (state: GameState): void => {
    let textTileCount = 0
    for (const item of state.items) {
      if (!item.isText) continue
      if (item.props.includes('hide')) continue
      textTileCount += 1
    }
    const mix = readabilityMix(
      textTileCount,
      state.width * state.height,
      preset.readability.textDensitySoftCap,
    )
    currentReadabilityMix = mix
    bloomPass.strength = lerp(
      preset.bloom.strength,
      preset.readability.bloomStrengthFloor,
      mix,
    )
    activeBokehAperture = lerp(
      preset.bokeh.aperture,
      preset.readability.apertureFloor,
      mix,
    )
    activeBokehMaxBlur = lerp(
      preset.bokeh.maxBlur,
      preset.readability.maxBlurFloor,
      mix,
    )
    const shouldEnableBokeh =
      activeBokehMaxBlur > preset.readability.maxBlurFloor * BOKEH_ENABLE_MARGIN ||
      activeBokehAperture > preset.readability.apertureFloor * BOKEH_ENABLE_MARGIN
    if (bokehPass.enabled !== shouldEnableBokeh) bokehPass.enabled = shouldEnableBokeh
    updateBloomResolution()
    updateBokehFocus()
  }

  const mount = (nextContainer: HTMLElement): void => {
    container = nextContainer
    container.classList.add('board-3d')
    container.dataset.clayPreset = 'single'
    if (renderer.domElement.parentElement !== container) {
      container.textContent = ''
      container.appendChild(renderer.domElement)
    }
    if (updateViewport()) needsRender = true
    ensureFrame()
  }

  const sync = (state: GameState): void => {
    if (!container) return

    if (boardWidth !== state.width || boardHeight !== state.height) {
      boardWidth = state.width
      boardHeight = state.height
      rebuildGround()
      updateCamera()
    }

    applyReadabilityGuard(state)
    syncEntities(state)
    needsRender = true
    ensureFrame()
  }

  const dispose = (): void => {
    if (rafId) window.cancelAnimationFrame(rafId)
    frameActive = false
    rafId = 0

    for (const node of nodes.values()) {
      entityGroup.remove(node.mesh)
      entityGroup.remove(node.shadow)
      node.shadowMaterial.dispose()
    }
    nodes.clear()
    cardGeometry.dispose()
    shadowGeometry.dispose()

    for (const material of materialCache.values()) material.dispose()
    materialCache.clear()
    for (const texture of textureCache.values()) texture.dispose()
    textureCache.clear()
    shadowTexture.dispose()
    scene.remove(dustLayer.points)
    dustLayer.geometry.dispose()
    dustLayer.material.dispose()
    dustLayer.texture.dispose()

    if (groundMesh) {
      world.remove(groundMesh)
      groundMesh.geometry.dispose()
      groundMesh.material.dispose()
    }
    groundMesh = null
    if (playAreaFillMesh) {
      world.remove(playAreaFillMesh)
      playAreaFillMesh.geometry.dispose()
      playAreaFillMesh.material.dispose()
    }
    playAreaFillMesh = null
    if (playAreaOutline) {
      world.remove(playAreaOutline)
      playAreaOutline.geometry.dispose()
      playAreaOutline.material.dispose()
    }
    playAreaOutline = null
    if (groundTexture) groundTexture.dispose()
    groundTexture = null

    composer.dispose()
    renderer.dispose()
    renderer.domElement.remove()
    container = null
  }

  return {
    isSupported: true,
    mount,
    sync,
    dispose,
  }
}

export const createBoard3dRenderer = (): Board3dRenderer => {
  try {
    return createBoard3dRendererUnsafe()
  } catch (error) {
    console.warn('3D renderer unavailable, falling back to DOM board renderer.', error)
    return createNoopRenderer()
  }
}

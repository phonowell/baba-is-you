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
import {
  BOARD3D_LAYOUT_CONFIG,
  BOARD3D_CAMERA_CONFIG,
  BOARD3D_LIGHTING_CONFIG,
  BOARD3D_SHADOW_CONFIG,
  BOARD3D_POSTFX_CONFIG,
  BOARD3D_ANIMATION_CONFIG,
  BOARD3D_RULE_VISUAL_CONFIG,
  BOARD3D_TEXT_CARD_STYLE_CONFIG,
  BOARD3D_CARD_TEXTURE_CONFIG,
  BOARD3D_GROUND_TEXTURE_CONFIG,
  BOARD3D_DUST_TEXTURE_CONFIG,
  BOARD3D_SHADOW_TEXTURE_CONFIG,
  BOARD3D_ATMOSPHERE_CONFIG,
} from './board-3d-config.js'
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
import type { Direction, GameState, Item } from '../logic/types.js'

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

const {
  CARD_WORLD_SIZE,
  CARD_STACK_DEPTH,
  CARD_STACK_LATERAL_SPREAD,
  CARD_STACK_DEPTH_SPREAD,
  CARD_BASE_Z,
  CARD_LAYER_DEPTH,
  GROUND_SURFACE_Z,
  GROUND_ACTIVE_FILL_Z,
  GROUND_HUG_BASE_Z,
  GROUND_HUG_STACK_DEPTH,
  FLOAT_ITEM_LIFT_Z,
  GROUND_EXPANDED_MIN_SIZE,
  PLAY_AREA_OUTLINE_Z,
  PLAY_AREA_OUTLINE_RADIUS,
  PLAY_AREA_OUTLINE_OPACITY,
  CARD_UPRIGHT_ROT_X,
  CARD_BACK_TILT_RAD,
  CARD_FLAT_ROT_X,
  TEXTURE_ANISOTROPY_CAP,
  CARD_MATERIAL_ALPHA_TEST,
  CARD_MATERIAL_ROUGHNESS,
  CARD_MATERIAL_METALNESS,
  CARD_MATERIAL_EMISSIVE_COLOR,
  GROUND_EXPANDED_PADDING,
  GROUND_MATERIAL_ROUGHNESS,
  GROUND_MATERIAL_METALNESS,
  PLAY_AREA_FILL_COLOR,
  PLAY_AREA_FILL_ROUGHNESS,
  PLAY_AREA_FILL_METALNESS,
  PLAY_AREA_OUTLINE_COLOR,
  ENTITY_IDLE_SHADOW_SCALE,
  POSITION_EPSILON,
  PLAY_AREA_OUTLINE_SAMPLES_MIN,
  PLAY_AREA_OUTLINE_SAMPLES_DENSITY,
  PLAY_AREA_RADIUS_CLAMP_RATIO,
} = BOARD3D_LAYOUT_CONFIG

const {
  CAMERA_PITCH_RAD,
  CAMERA_DISTANCE_SCALE,
  CAMERA_DISTANCE_MIN,
  CAMERA_LOOK_AT_OFFSET_Y,
  CAMERA_LOOK_AT_DEPTH_BIAS,
  CAMERA_NEAR,
  CAMERA_FAR,
  WORLD_ROTATION_X,
} = BOARD3D_CAMERA_CONFIG

const {
  LIGHT_HEIGHT_Y_BASE,
  LIGHT_HEIGHT_Y_SPAN_MUL,
  SIDE_LIGHT_OFFSET_X_BASE,
  SIDE_LIGHT_OFFSET_X_MUL,
  SIDE_LIGHT_OFFSET_Z_BASE,
  SIDE_LIGHT_OFFSET_Z_MUL,
  LIGHT_CAMERA_SIDE_TILT_RAD,
  AMBIENT_LIGHT_COLOR,
  AMBIENT_LIGHT_INTENSITY_MUL,
  SIDE_LIGHT_INTENSITY_MIN,
  SIDE_LIGHT_INTENSITY_MUL,
  SIDE_LIGHT_INITIAL_Y,
  SIDE_LIGHT_INITIAL_Z,
  LIGHT_SHADOW_CAMERA_NEAR,
  LIGHT_SHADOW_BIAS,
  LIGHT_SHADOW_NORMAL_BIAS,
  LIGHT_HEIGHT_Y_EXTRA,
  LIGHT_DROP_Y_MIN,
  LIGHT_DROP_Y_SUB,
  LIGHT_TARGET_Y,
} = BOARD3D_LIGHTING_CONFIG

const {
  SHADOW_BASE_Z,
  SHADOW_MAP_SIZE_SCALE,
  SHADOW_RADIUS,
  SHADOW_FRUSTUM_BASE,
  SHADOW_FRUSTUM_SPAN_MUL,
  SHADOW_FAR_PADDING,
  SHADOW_FRUSTUM_DISTANCE_SCALE,
  SHADOW_ANGLE_SPAN_BOOST,
  SHADOW_GEOMETRY_SIZE,
  ENTITY_SHADOW_COLOR,
  ENTITY_SHADOW_OPACITY,
  ENTITY_SHADOW_ALPHA_TEST,
  SHADOW_SCALE_BASE,
  SHADOW_SCALE_JUMP_MUL,
  SHADOW_SCALE_LANDING_MUL,
  SHADOW_OPACITY_MIN,
  SHADOW_OPACITY_BASE,
  SHADOW_OPACITY_JUMP_MUL,
  SHADOW_OPACITY_LANDING_MUL,
} = BOARD3D_SHADOW_CONFIG

const {
  MAX_DEVICE_PIXEL_RATIO,
  POSTFX_PIXEL_RATIO_SCALE,
  BLOOM_RESOLUTION_SCALE,
  BLOOM_DENSE_TEXT_RESOLUTION_SCALE,
  BOKEH_ENABLE_MARGIN,
  BLOOM_INITIAL_RESOLUTION_X,
  BLOOM_INITIAL_RESOLUTION_Y,
  BOKEH_INITIAL_FOCUS,
  BOKEH_FOCUS_MIN,
} = BOARD3D_POSTFX_CONFIG

const {
  EMOJI_CARD_TEXTURE_SIZE,
  MOVE_ANIM_MS,
  SPAWN_ANIM_MS,
  DESPAWN_ANIM_MS,
  SPAWN_SCALE_FROM,
  DESPAWN_SCALE_TO,
  LAND_PULSE_MS,
  JUMP_HEIGHT,
  EMOJI_MICRO_STRETCH_CYCLE_MS,
  EMOJI_MICRO_STRETCH_Y_AMP,
  EMOJI_MICRO_STRETCH_X_AMP,
  MOVE_STRETCH_FACTOR,
  MOVE_SQUASH_FACTOR,
  LANDING_PULSE_HEIGHT,
  SPAWN_VERTICAL_OFFSET,
  DESPAWN_VERTICAL_OFFSET,
  MOVE_ROLL_AMPLITUDE,
} = BOARD3D_ANIMATION_CONFIG

const {
  BELT_DIRECTION_GLYPH_UP,
  BELT_DIRECTION_GLYPH_RIGHT,
  BELT_DIRECTION_GLYPH_DOWN,
  BELT_DIRECTION_GLYPH_LEFT,
  FACING_ARROW_PROPS,
  HAS_EMOJI,
} = BOARD3D_RULE_VISUAL_CONFIG

const {
  TEXT_CARD_SYNTAX_BACKGROUND,
  TEXT_CARD_SYNTAX_BORDER,
  TEXT_CARD_SYNTAX_TEXT,
  TEXT_CARD_SYNTAX_OUTLINE,
  TEXT_CARD_NORMAL_BACKGROUND,
  TEXT_CARD_NORMAL_BORDER,
  TEXT_CARD_NORMAL_TEXT,
  TEXT_CARD_NORMAL_OUTLINE,
} = BOARD3D_TEXT_CARD_STYLE_CONFIG

const {
  CARD_TEXTURE_SIZE,
  CARD_TEXTURE_PAD_RATIO,
  CARD_TEXTURE_SHADOW_OFFSET_X,
  CARD_TEXTURE_SHADOW_OFFSET_Y,
  CARD_TEXTURE_CORNER_RADIUS_RATIO,
  CARD_TEXTURE_SHADOW_COLOR,
  TRANSPARENT_COLOR,
  CARD_TEXTURE_BORDER_WIDTH_RATIO,
  CARD_TEXTURE_BORDER_INSET,
  CARD_TEXTURE_BORDER_RADIUS_RATIO,
  CARD_TEXTURE_EMOJI_FONT_RATIO,
  CARD_TEXTURE_TEXT_LONG_THRESHOLD,
  CARD_TEXTURE_TEXT_MEDIUM_THRESHOLD,
  CARD_TEXTURE_TEXT_LONG_FONT_SIZE,
  CARD_TEXTURE_TEXT_MEDIUM_FONT_SIZE,
  CARD_TEXTURE_TEXT_SHORT_FONT_SIZE,
  CARD_TEXTURE_LABEL_OFFSET_Y,
  CARD_TEXTURE_TEXT_STROKE_WIDTH_RATIO,
  CARD_TEXTURE_LABEL_SHADOW_BLUR,
  CARD_TEXTURE_LABEL_SHADOW_COLOR,
  CARD_TEXTURE_NO_SHADOW_COLOR,
  CARD_TEXTURE_EMOJI_FONT_FAMILY,
  CARD_TEXTURE_TEXT_FONT_FAMILY,
  CARD_TEXTURE_DIRECTION_FONT_RATIO,
  CARD_TEXTURE_DIRECTION_EDGE_INSET_RATIO,
  CARD_TEXTURE_DIRECTION_SHADOW_BLUR,
  CARD_TEXTURE_DIRECTION_SHADOW_COLOR,
  CARD_TEXTURE_DIRECTION_OFFSET_Y,
} = BOARD3D_CARD_TEXTURE_CONFIG

const {
  GROUND_TEXTURE_TILE_SIZE,
  GROUND_TEXTURE_CANVAS_SIZE,
  GROUND_TEXTURE_BASE_COLOR,
  GROUND_TEXTURE_WASH_START,
  GROUND_TEXTURE_WASH_MIDDLE,
  GROUND_TEXTURE_WASH_END,
  GROUND_TEXTURE_WASH_MIDDLE_AT,
  GROUND_TEXTURE_GRAIN_AMP,
  GROUND_TEXTURE_CLOUD_AMP,
  GROUND_TEXTURE_WARM_AMP,
  GROUND_TEXTURE_CLOUD_FREQ,
  GROUND_TEXTURE_WARM_FREQ,
  GROUND_TEXTURE_CLOUD_SEED_X,
  GROUND_TEXTURE_CLOUD_SEED_Y,
  GROUND_TEXTURE_WARM_SEED_X,
  GROUND_TEXTURE_WARM_SEED_Y,
  GROUND_TEXTURE_GREEN_GRAIN_WEIGHT,
  GROUND_TEXTURE_GREEN_CLOUD_WEIGHT,
  GROUND_TEXTURE_BLUE_GRAIN_WEIGHT,
  GROUND_TEXTURE_SPECKLE_COUNT,
  GROUND_TEXTURE_SPECKLE_RADIUS_BASE,
  GROUND_TEXTURE_SPECKLE_RADIUS_RANGE,
  GROUND_TEXTURE_SPECKLE_ALPHA_BASE,
  GROUND_TEXTURE_SPECKLE_ALPHA_RANGE,
  GROUND_TEXTURE_SPECKLE_SEED_X,
  GROUND_TEXTURE_SPECKLE_SEED_Y,
  GROUND_TEXTURE_SPECKLE_SEED_RADIUS,
  GROUND_TEXTURE_SPECKLE_SEED_ALPHA,
  GROUND_TEXTURE_STROKE_COUNT,
  GROUND_TEXTURE_STROKE_LENGTH_BASE,
  GROUND_TEXTURE_STROKE_LENGTH_RANGE,
  GROUND_TEXTURE_STROKE_ALPHA_BASE,
  GROUND_TEXTURE_STROKE_ALPHA_RANGE,
  GROUND_TEXTURE_STROKE_WIDTH_BASE,
  GROUND_TEXTURE_STROKE_WIDTH_RANGE,
  GROUND_TEXTURE_STROKE_RGB,
  GROUND_TEXTURE_STROKE_SEED_X,
  GROUND_TEXTURE_STROKE_SEED_Y,
  GROUND_TEXTURE_STROKE_SEED_LENGTH,
  GROUND_TEXTURE_STROKE_SEED_ANGLE,
  GROUND_TEXTURE_STROKE_SEED_ALPHA,
  GROUND_TEXTURE_STROKE_SEED_WIDTH,
} = BOARD3D_GROUND_TEXTURE_CONFIG

const {
  DUST_TEXTURE_SIZE,
  DUST_TEXTURE_CENTER,
  DUST_TEXTURE_INNER_RADIUS,
  DUST_TEXTURE_OUTER_RADIUS,
  DUST_TEXTURE_STOP_0,
  DUST_TEXTURE_STOP_1,
  DUST_TEXTURE_STOP_2,
  DUST_TEXTURE_STOP_1_AT,
} = BOARD3D_DUST_TEXTURE_CONFIG

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

const {
  ATMOSPHERE_FOG_COLOR,
  ATMOSPHERE_FOG_DENSITY,
  DUST_PARTICLE_COUNT,
  DUST_SPREAD_BASE,
  DUST_SPREAD_MUL,
  DUST_HEIGHT_BASE,
  DUST_HEIGHT_MUL,
  DUST_LAYER_DEPTH_SCALE,
  DUST_PARTICLE_SIZE,
  DUST_PARTICLE_OPACITY,
  DUST_PARTICLE_ALPHA_TEST,
  DUST_PARTICLE_COLOR,
  DUST_LAYER_BASE_Y,
  DUST_HEIGHT_EXPONENT,
  DUST_SEED_ANGLE,
  DUST_SEED_RADIUS,
  DUST_SEED_HEIGHT,
} = BOARD3D_ATMOSPHERE_CONFIG

const BELT_DIRECTION_GLYPHS: Record<Direction, string> = {
  up: BELT_DIRECTION_GLYPH_UP,
  right: BELT_DIRECTION_GLYPH_RIGHT,
  down: BELT_DIRECTION_GLYPH_DOWN,
  left: BELT_DIRECTION_GLYPH_LEFT,
}

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
  const curveSamples = Math.max(
    PLAY_AREA_OUTLINE_SAMPLES_MIN,
    Math.round((halfWidth + halfHeight) * PLAY_AREA_OUTLINE_SAMPLES_DENSITY),
  )
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
  const radius = Math.min(
    PLAY_AREA_OUTLINE_RADIUS,
    halfWidth * PLAY_AREA_RADIUS_CLAMP_RATIO,
    halfHeight * PLAY_AREA_RADIUS_CLAMP_RATIO,
  )
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
  return ((seed & 0xfff) / 0xfff - 0.5) * MOVE_ROLL_AMPLITUDE
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
        background: TEXT_CARD_SYNTAX_BACKGROUND,
        border: TEXT_CARD_SYNTAX_BORDER,
        textColor: TEXT_CARD_SYNTAX_TEXT,
        outlineColor: TEXT_CARD_SYNTAX_OUTLINE,
      }
    }
    return {
      key: `text:normal:${item.name}`,
      label,
      facingDirection: null,
      isEmojiLabel: false,
      background: TEXT_CARD_NORMAL_BACKGROUND,
      border: TEXT_CARD_NORMAL_BORDER,
      textColor: TEXT_CARD_NORMAL_TEXT,
      outlineColor: TEXT_CARD_NORMAL_OUTLINE,
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

  const pad = textureSize * CARD_TEXTURE_PAD_RATIO
  const size = textureSize - pad * 2

  ctx.clearRect(0, 0, textureSize, textureSize)
  ctx.fillStyle = TRANSPARENT_COLOR
  ctx.fillRect(0, 0, textureSize, textureSize)

  if (!spec.isEmojiLabel) {
    roundRectPath(
      ctx,
      pad + CARD_TEXTURE_SHADOW_OFFSET_X,
      pad + CARD_TEXTURE_SHADOW_OFFSET_Y,
      size,
      size,
      textureSize * CARD_TEXTURE_CORNER_RADIUS_RATIO,
    )
    ctx.fillStyle = CARD_TEXTURE_SHADOW_COLOR
    ctx.fill()

    roundRectPath(ctx, pad, pad, size, size, textureSize * CARD_TEXTURE_CORNER_RADIUS_RATIO)
    ctx.fillStyle = spec.background
    ctx.fill()

    ctx.lineWidth = textureSize * CARD_TEXTURE_BORDER_WIDTH_RATIO
    ctx.strokeStyle = spec.border
    const borderInset = CARD_TEXTURE_BORDER_INSET
    roundRectPath(
      ctx,
      pad + borderInset,
      pad + borderInset,
      size - borderInset * 2,
      size - borderInset * 2,
      textureSize * CARD_TEXTURE_BORDER_RADIUS_RATIO,
    )
    ctx.stroke()
  }

  const labelLength = [...spec.label].length
  const fontSize = spec.isEmojiLabel
    ? Math.round(textureSize * CARD_TEXTURE_EMOJI_FONT_RATIO)
    : labelLength >= CARD_TEXTURE_TEXT_LONG_THRESHOLD
      ? CARD_TEXTURE_TEXT_LONG_FONT_SIZE
      : labelLength >= CARD_TEXTURE_TEXT_MEDIUM_THRESHOLD
        ? CARD_TEXTURE_TEXT_MEDIUM_FONT_SIZE
        : CARD_TEXTURE_TEXT_SHORT_FONT_SIZE
  const labelOffsetY = spec.isEmojiLabel ? 0 : CARD_TEXTURE_LABEL_OFFSET_Y
  ctx.fillStyle = spec.textColor
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = spec.isEmojiLabel
    ? `${fontSize}px ${CARD_TEXTURE_EMOJI_FONT_FAMILY}`
    : `700 ${fontSize}px ${CARD_TEXTURE_TEXT_FONT_FAMILY}`
  if (!spec.isEmojiLabel) {
    ctx.lineWidth = textureSize * CARD_TEXTURE_TEXT_STROKE_WIDTH_RATIO
    ctx.lineJoin = 'round'
    ctx.strokeStyle = spec.outlineColor
    ctx.strokeText(spec.label, textureSize / 2, textureSize / 2 + labelOffsetY)
  }
  ctx.shadowBlur = spec.isEmojiLabel ? 0 : CARD_TEXTURE_LABEL_SHADOW_BLUR
  ctx.shadowColor = spec.isEmojiLabel
    ? CARD_TEXTURE_NO_SHADOW_COLOR
    : CARD_TEXTURE_LABEL_SHADOW_COLOR
  ctx.fillText(spec.label, textureSize / 2, textureSize / 2 + labelOffsetY)

  if (spec.facingDirection) {
    const marker = BELT_DIRECTION_GLYPHS[spec.facingDirection]
    const markerFontSize = Math.round(
      textureSize * CARD_TEXTURE_DIRECTION_FONT_RATIO,
    )
    const edgeInset =
      pad + textureSize * CARD_TEXTURE_DIRECTION_EDGE_INSET_RATIO
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
    ctx.font = `${markerFontSize}px ${CARD_TEXTURE_EMOJI_FONT_FAMILY}`
    ctx.shadowBlur = CARD_TEXTURE_DIRECTION_SHADOW_BLUR
    ctx.shadowColor = CARD_TEXTURE_DIRECTION_SHADOW_COLOR
    ctx.fillText(marker, markerX, markerY + CARD_TEXTURE_DIRECTION_OFFSET_Y)
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
  canvas.width = GROUND_TEXTURE_CANVAS_SIZE
  canvas.height = GROUND_TEXTURE_CANVAS_SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Failed to create ground texture context.')

  ctx.fillStyle = GROUND_TEXTURE_BASE_COLOR
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  const wash = ctx.createLinearGradient(0, 0, canvas.width, canvas.height)
  wash.addColorStop(0, GROUND_TEXTURE_WASH_START)
  wash.addColorStop(GROUND_TEXTURE_WASH_MIDDLE_AT, GROUND_TEXTURE_WASH_MIDDLE)
  wash.addColorStop(1, GROUND_TEXTURE_WASH_END)
  ctx.fillStyle = wash
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const pixels = imageData.data
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const index = (y * canvas.width + x) * 4
      const grain = (hash2d01(x, y) - 0.5) * GROUND_TEXTURE_GRAIN_AMP
      const cloud =
        (hash2d01(
          x * GROUND_TEXTURE_CLOUD_FREQ + GROUND_TEXTURE_CLOUD_SEED_X,
          y * GROUND_TEXTURE_CLOUD_FREQ + GROUND_TEXTURE_CLOUD_SEED_Y,
        ) -
          0.5) *
        GROUND_TEXTURE_CLOUD_AMP
      const warm =
        (hash2d01(
          x * GROUND_TEXTURE_WARM_FREQ + GROUND_TEXTURE_WARM_SEED_X,
          y * GROUND_TEXTURE_WARM_FREQ + GROUND_TEXTURE_WARM_SEED_Y,
        ) -
          0.5) *
        GROUND_TEXTURE_WARM_AMP
      const r = pixels[index + 0] ?? 0
      const g = pixels[index + 1] ?? 0
      const b = pixels[index + 2] ?? 0
      pixels[index + 0] = Math.max(0, Math.min(255, Math.round(r + grain + cloud)))
      pixels[index + 1] = Math.max(
        0,
        Math.min(
          255,
          Math.round(
            g +
              grain * GROUND_TEXTURE_GREEN_GRAIN_WEIGHT +
              cloud * GROUND_TEXTURE_GREEN_CLOUD_WEIGHT +
              warm,
          ),
        ),
      )
      pixels[index + 2] = Math.max(
        0,
        Math.min(
          255,
          Math.round(b + grain * GROUND_TEXTURE_BLUE_GRAIN_WEIGHT - warm),
        ),
      )
    }
  }
  ctx.putImageData(imageData, 0, 0)

  for (let i = 0; i < GROUND_TEXTURE_SPECKLE_COUNT; i += 1) {
    const seed = i + 1
    const x = hash01(seed * GROUND_TEXTURE_SPECKLE_SEED_X) * canvas.width
    const y = hash01(seed * GROUND_TEXTURE_SPECKLE_SEED_Y) * canvas.height
    const radius =
      GROUND_TEXTURE_SPECKLE_RADIUS_BASE +
      hash01(seed * GROUND_TEXTURE_SPECKLE_SEED_RADIUS) *
        GROUND_TEXTURE_SPECKLE_RADIUS_RANGE
    const alpha =
      GROUND_TEXTURE_SPECKLE_ALPHA_BASE +
      hash01(seed * GROUND_TEXTURE_SPECKLE_SEED_ALPHA) *
        GROUND_TEXTURE_SPECKLE_ALPHA_RANGE
    ctx.beginPath()
    ctx.fillStyle = `rgba(255,255,255,${alpha})`
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.fill()
  }

  for (let i = 0; i < GROUND_TEXTURE_STROKE_COUNT; i += 1) {
    const seed = i + 1
    const x = hash01(seed * GROUND_TEXTURE_STROKE_SEED_X) * canvas.width
    const y = hash01(seed * GROUND_TEXTURE_STROKE_SEED_Y) * canvas.height
    const length =
      GROUND_TEXTURE_STROKE_LENGTH_BASE +
      hash01(seed * GROUND_TEXTURE_STROKE_SEED_LENGTH) *
        GROUND_TEXTURE_STROKE_LENGTH_RANGE
    const angle = hash01(seed * GROUND_TEXTURE_STROKE_SEED_ANGLE) * Math.PI * 2
    const alpha =
      GROUND_TEXTURE_STROKE_ALPHA_BASE +
      hash01(seed * GROUND_TEXTURE_STROKE_SEED_ALPHA) *
        GROUND_TEXTURE_STROKE_ALPHA_RANGE
    ctx.lineWidth =
      GROUND_TEXTURE_STROKE_WIDTH_BASE +
      hash01(seed * GROUND_TEXTURE_STROKE_SEED_WIDTH) *
        GROUND_TEXTURE_STROKE_WIDTH_RANGE
    ctx.strokeStyle = `rgba(${GROUND_TEXTURE_STROKE_RGB},${alpha})`
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
  canvas.width = DUST_TEXTURE_SIZE
  canvas.height = DUST_TEXTURE_SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Failed to create dust texture context.')

  const gradient = ctx.createRadialGradient(
    DUST_TEXTURE_CENTER,
    DUST_TEXTURE_CENTER,
    DUST_TEXTURE_INNER_RADIUS,
    DUST_TEXTURE_CENTER,
    DUST_TEXTURE_CENTER,
    DUST_TEXTURE_OUTER_RADIUS,
  )
  gradient.addColorStop(0, DUST_TEXTURE_STOP_0)
  gradient.addColorStop(DUST_TEXTURE_STOP_1_AT, DUST_TEXTURE_STOP_1)
  gradient.addColorStop(1, DUST_TEXTURE_STOP_2)
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
    const angle = hash01(seed * DUST_SEED_ANGLE) * Math.PI * 2
    const radius = Math.sqrt(hash01(seed * DUST_SEED_RADIUS))
    const height = Math.pow(
      hash01(seed * DUST_SEED_HEIGHT),
      DUST_HEIGHT_EXPONENT,
    )
    positions[index * 3 + 0] = Math.cos(angle) * radius
    positions[index * 3 + 1] = height
    positions[index * 3 + 2] = Math.sin(angle) * radius
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  const texture = createDustTexture()
  const material = new PointsMaterial({
    map: texture,
    color: new Color(DUST_PARTICLE_COLOR),
    size: DUST_PARTICLE_SIZE,
    transparent: true,
    opacity: DUST_PARTICLE_OPACITY,
    alphaTest: DUST_PARTICLE_ALPHA_TEST,
    depthWrite: false,
    sizeAttenuation: true,
  })
  const points = new Points(geometry, material)
  points.position.set(0, DUST_LAYER_BASE_Y, 0)
  return { points, geometry, material, texture }
}

const createShadowTexture = (): CanvasTexture => {
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
  const camera = new PerspectiveCamera(
    initialCameraTier.fov,
    1,
    CAMERA_NEAR,
    CAMERA_FAR,
  )
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
    new Vector2(
      BLOOM_INITIAL_RESOLUTION_X,
      BLOOM_INITIAL_RESOLUTION_Y,
    ),
    preset.bloom.strength,
    preset.bloom.radius,
    preset.bloom.threshold,
  )
  const bokehPass = new BokehPass(scene, camera, {
    focus: BOKEH_INITIAL_FOCUS,
    aperture: preset.bokeh.aperture,
    maxblur: preset.bokeh.maxBlur,
  })
  composer.addPass(renderPass)
  composer.addPass(bloomPass)
  composer.addPass(bokehPass)

  const ambientLight = new AmbientLight(
    AMBIENT_LIGHT_COLOR,
    preset.lighting.ambientIntensity * AMBIENT_LIGHT_INTENSITY_MUL,
  )
  scene.add(ambientLight)

  const sideLightIntensity = Math.max(
    SIDE_LIGHT_INTENSITY_MIN,
    preset.lighting.topLightIntensity * SIDE_LIGHT_INTENSITY_MUL,
  )
  const shadowMapSize = Math.max(
    preset.lighting.topLightShadowMapSize,
    Math.round(preset.lighting.topLightShadowMapSize * SHADOW_MAP_SIZE_SCALE),
  )
  const leftLight = new DirectionalLight(
    preset.lighting.topLightColor,
    sideLightIntensity,
  )
  leftLight.position.set(0, SIDE_LIGHT_INITIAL_Y, SIDE_LIGHT_INITIAL_Z)
  leftLight.castShadow = true
  leftLight.shadow.mapSize.width = shadowMapSize
  leftLight.shadow.mapSize.height = shadowMapSize
  leftLight.shadow.camera.near = LIGHT_SHADOW_CAMERA_NEAR
  leftLight.shadow.camera.far = preset.lighting.topLightShadowFar
  leftLight.shadow.bias = LIGHT_SHADOW_BIAS
  leftLight.shadow.normalBias = LIGHT_SHADOW_NORMAL_BIAS
  leftLight.shadow.radius = SHADOW_RADIUS
  scene.add(leftLight)
  scene.add(leftLight.target)

  const rightLight = new DirectionalLight(preset.lighting.topLightColor, sideLightIntensity)
  rightLight.castShadow = true
  rightLight.shadow.mapSize.width = shadowMapSize
  rightLight.shadow.mapSize.height = shadowMapSize
  rightLight.shadow.camera.near = LIGHT_SHADOW_CAMERA_NEAR
  rightLight.shadow.camera.far = preset.lighting.topLightShadowFar
  rightLight.shadow.bias = LIGHT_SHADOW_BIAS
  rightLight.shadow.normalBias = LIGHT_SHADOW_NORMAL_BIAS
  rightLight.shadow.radius = SHADOW_RADIUS
  scene.add(rightLight)
  scene.add(rightLight.target)

  const world = new Group()
  world.rotation.x = WORLD_ROTATION_X
  scene.add(world)
  const entityGroup = new Group()
  world.add(entityGroup)

  const cardGeometry = new PlaneGeometry(CARD_WORLD_SIZE, CARD_WORLD_SIZE)
  const shadowGeometry = new PlaneGeometry(
    SHADOW_GEOMETRY_SIZE,
    SHADOW_GEOMETRY_SIZE,
  )
  const textureCache = new Map<string, CanvasTexture>()
  const materialCache = new Map<string, CardMaterial>()
  const nodes = new Map<number, EntityNode>()
  const shadowTexture = createShadowTexture()
  const dustLayer = createDustLayer()
  scene.add(dustLayer.points)
  const textureAnisotropy = Math.min(
    TEXTURE_ANISOTROPY_CAP,
    renderer.capabilities.getMaxAnisotropy(),
  )

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
          alphaTest: CARD_MATERIAL_ALPHA_TEST,
          fog: true,
          side: DoubleSide,
        })
      : new MeshStandardMaterial({
          map: texture,
          transparent: true,
          alphaTest: CARD_MATERIAL_ALPHA_TEST,
          roughness: CARD_MATERIAL_ROUGHNESS,
          metalness: CARD_MATERIAL_METALNESS,
          emissive: new Color(CARD_MATERIAL_EMISSIVE_COLOR),
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
      BOKEH_FOCUS_MIN,
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
    const topHeightY = Math.max(
      LIGHT_HEIGHT_Y_BASE,
      span * LIGHT_HEIGHT_Y_SPAN_MUL + LIGHT_HEIGHT_Y_EXTRA,
    )
    const sideOffsetX = width * SIDE_LIGHT_OFFSET_X_MUL + SIDE_LIGHT_OFFSET_X_BASE
    const sideOffsetZ = Math.max(SIDE_LIGHT_OFFSET_Z_BASE, height * SIDE_LIGHT_OFFSET_Z_MUL)
    const targetZ = height * CAMERA_LOOK_AT_DEPTH_BIAS
    const lightDropY = Math.max(
      LIGHT_DROP_Y_MIN,
      topHeightY - LIGHT_DROP_Y_SUB,
    )
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
    leftLight.target.position.set(0, LIGHT_TARGET_Y, targetZ)
    leftLight.target.updateMatrixWorld()

    rightLight.position.set(sideOffsetX, topHeightY, lightZ)
    rightLight.target.position.set(0, LIGHT_TARGET_Y, targetZ)
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

    const expandedWidth = Math.max(
      boardWidth + GROUND_EXPANDED_PADDING,
      GROUND_EXPANDED_MIN_SIZE,
    )
    const expandedHeight = Math.max(
      boardHeight + GROUND_EXPANDED_PADDING,
      GROUND_EXPANDED_MIN_SIZE,
    )
    const geometry = new PlaneGeometry(expandedWidth, expandedHeight)
    groundTexture = createGroundTexture()
    groundTexture.repeat.set(
      Math.max(1, expandedWidth / GROUND_TEXTURE_TILE_SIZE),
      Math.max(1, expandedHeight / GROUND_TEXTURE_TILE_SIZE),
    )
    groundTexture.needsUpdate = true
    const material = new MeshStandardMaterial({
      map: groundTexture,
      roughness: GROUND_MATERIAL_ROUGHNESS,
      metalness: GROUND_MATERIAL_METALNESS,
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
      color: new Color(PLAY_AREA_FILL_COLOR),
      roughness: PLAY_AREA_FILL_ROUGHNESS,
      metalness: PLAY_AREA_FILL_METALNESS,
    })
    playAreaFillMesh = new Mesh(playAreaFillGeometry, playAreaFillMaterial)
    playAreaFillMesh.position.z = GROUND_ACTIVE_FILL_Z
    playAreaFillMesh.receiveShadow = true
    world.add(playAreaFillMesh)

    const outlineGeometry = new BufferGeometry().setFromPoints(
      buildRoundedRectOutlinePoints(halfWidth, halfHeight, PLAY_AREA_OUTLINE_Z),
    )
    const outlineMaterial = new LineBasicMaterial({
      color: new Color(PLAY_AREA_OUTLINE_COLOR),
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
      color: new Color(ENTITY_SHADOW_COLOR),
      transparent: true,
      opacity: ENTITY_SHADOW_OPACITY,
      depthWrite: false,
      alphaTest: ENTITY_SHADOW_ALPHA_TEST,
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
      const stretch = 1 + wave * MOVE_STRETCH_FACTOR
      const squash = 1 - wave * MOVE_SQUASH_FACTOR
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
      landing = Math.sin((1 - landT) * Math.PI) * LANDING_PULSE_HEIGHT
      if (landT >= 1) node.landStartMs = null
    }

    let scaleFactor = 1
    let verticalOffset = 0
    if (node.spawnStartMs !== null) {
      const spawnT = clamp01((nowMs - node.spawnStartMs) / SPAWN_ANIM_MS)
      scaleFactor *= lerp(SPAWN_SCALE_FROM, 1, easeOutCubic(spawnT))
      verticalOffset += (1 - spawnT) * SPAWN_VERTICAL_OFFSET
      if (spawnT >= 1) node.spawnStartMs = null
    }

    let finishedLeaving = false
    let shadowOpacityMul = 1
    if (node.despawnStartMs !== null) {
      const despawnT = clamp01((nowMs - node.despawnStartMs) / DESPAWN_ANIM_MS)
      const fade = 1 - easeOutCubic(despawnT)
      scaleFactor *= lerp(1, DESPAWN_SCALE_TO, despawnT)
      shadowOpacityMul = Math.max(0, fade)
      verticalOffset += despawnT * DESPAWN_VERTICAL_OFFSET
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

    const shadowScale =
      SHADOW_SCALE_BASE +
      jump * SHADOW_SCALE_JUMP_MUL +
      landing * SHADOW_SCALE_LANDING_MUL
    const shadowOpacity = Math.max(
      SHADOW_OPACITY_MIN,
      SHADOW_OPACITY_BASE -
        jump * SHADOW_OPACITY_JUMP_MUL +
        landing * SHADOW_OPACITY_LANDING_MUL,
    )
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
      if (!node.moving && Math.abs(node.rotRoll - stableRoll) > POSITION_EPSILON) {
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
        node.shadow.scale.set(
          ENTITY_IDLE_SHADOW_SCALE,
          ENTITY_IDLE_SHADOW_SCALE,
          1,
        )
        node.shadowMaterial.opacity = ENTITY_SHADOW_OPACITY
        continue
      }

      const positionChanged =
        Math.abs(node.toX - target.x) > POSITION_EPSILON ||
        Math.abs(node.toY - target.y) > POSITION_EPSILON ||
        Math.abs(node.toBaseZ - target.baseZ) > POSITION_EPSILON

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
          node.shadow.scale.set(
            ENTITY_IDLE_SHADOW_SCALE,
            ENTITY_IDLE_SHADOW_SCALE,
            1,
          )
          node.shadowMaterial.opacity = ENTITY_SHADOW_OPACITY
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

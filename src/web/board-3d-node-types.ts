import type {
  BufferGeometry,
  Camera,
  CanvasTexture,
  Group,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshToonMaterial,
  PlaneGeometry,
} from 'three'

import type { Item } from '../logic/types.js'
import type { EntityVisual } from './board-3d-renderer-materials.js'

export type CardMaterial = MeshToonMaterial | MeshBasicMaterial
export type EntityMaterial = Material | Material[]
export type EntityMesh = Mesh<BufferGeometry, EntityMaterial>

// Whole-board celebration pulses: the runtime staggers them per node
// (rippling outward from the effect origin) and the pose pass folds them
// into jump/stretch.
export type NodePulseKind = 'hop' | 'slump'

export type EntityNode = {
  mesh: EntityMesh
  shadow: Mesh<PlaneGeometry, MeshBasicMaterial>
  shadowMaterial: MeshBasicMaterial
  specKey: string
  frameGeometries: BufferGeometry[]
  idleStretch: boolean
  idleFloat: boolean
  idlePhaseOffsetMs: number
  idleFrameOffset: number
  facesCamera: boolean
  // Target yaw of a rotating volume model (undefined = billboard/flat card).
  // Turns tween fromYaw → facingYaw over [yawStartMs, +yawDurationMs]; the
  // displayed angle is nodeYawAtMs, never this field directly.
  facingYaw: number | undefined
  fromYaw: number
  yawStartMs: number
  yawDurationMs: number
  rotRoll: number
  rollStep: number
  // Card colours cached per sync for particle bursts — nodes outlive the
  // item's presence on the board (despawn poofs fire after it is gone).
  fxColors: readonly string[]
  // One-shot flags so bursts fire exactly once per spawn/despawn window,
  // at the moment the animation actually starts (spawn may be staggered).
  spawnFxDone: boolean
  despawnFxDone: boolean
  pulseStartMs: number | null
  pulseKind: NodePulseKind | null
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

export type EntityBaseTarget = {
  x: number
  y: number
  baseZ: number
}

export type CreateEntityNodeDeps = {
  entityGroup: Group
  shadowGeometry: PlaneGeometry
  shadowTexture: CanvasTexture
  getVisual: (item: Item, overridden?: boolean, tileMask?: number) => EntityVisual
}

export type SyncEntityNodesDeps = {
  nodes: Map<number, EntityNode>
  getVisual: (item: Item, overridden?: boolean, tileMask?: number) => EntityVisual
  createNode: (item: Item, nowMs: number, spawnDelayMs?: number, tileMask?: number) => EntityNode
  camera: Camera
  // Set when the camera moved since the last pose pass — idle nodes must be
  // re-posed even though their board targets did not change.
  cameraChanged?: boolean
}

export type PoseStepResult = {
  animating: boolean
  finishedLeaving: boolean
}

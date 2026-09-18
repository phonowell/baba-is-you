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

export type EntityNode = {
  mesh: EntityMesh
  shadow: Mesh<PlaneGeometry, MeshBasicMaterial>
  shadowMaterial: MeshBasicMaterial
  specKey: string
  frameGeometries: BufferGeometry[]
  isEmoji: boolean
  emojiPhaseOffsetMs: number
  facesCamera: boolean
  facingYaw: number | undefined
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

export type EntityBaseTarget = {
  x: number
  y: number
  baseZ: number
}

export type CreateEntityNodeDeps = {
  entityGroup: Group
  shadowGeometry: PlaneGeometry
  shadowTexture: CanvasTexture
  getVisual: (item: Item, overridden?: boolean) => EntityVisual
}

export type SyncEntityNodesDeps = {
  nodes: Map<number, EntityNode>
  getVisual: (item: Item, overridden?: boolean) => EntityVisual
  createNode: (item: Item, nowMs: number) => EntityNode
  camera: Camera
  // Set when the camera moved since the last pose pass — idle nodes must be
  // re-posed even though their board targets did not change.
  cameraChanged?: boolean
}

export type PoseStepResult = {
  animating: boolean
  finishedLeaving: boolean
}

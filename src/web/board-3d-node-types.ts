import type { Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry } from 'three'
import type { CanvasTexture } from 'three'

import type { Item } from '../logic/types.js'

export type CardMaterial = MeshStandardMaterial

export type EntityNode = {
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

export type EntityBaseTarget = {
  x: number
  y: number
  baseZ: number
}

export type CreateEntityNodeDeps = {
  entityGroup: Group
  cardGeometry: PlaneGeometry
  shadowGeometry: PlaneGeometry
  shadowTexture: CanvasTexture
  getMaterial: (item: Item) => CardMaterial
}

export type SyncEntityNodesDeps = {
  nodes: Map<number, EntityNode>
  getMaterial: (item: Item) => CardMaterial
  createNode: (item: Item, nowMs: number) => EntityNode
}

export type PoseStepResult = {
  animating: boolean
  finishedLeaving: boolean
}

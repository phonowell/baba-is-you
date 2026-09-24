import type {
  BufferGeometry,
  Camera,
  CanvasTexture,
  Group,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshToonMaterial,
  Object3D,
  PlaneGeometry,
} from 'three'

import type { Item } from '../logic/types.js'
import type {
  EntityOutlineTint,
  EntityVisual,
  PlateBinding,
} from './board-3d-renderer-materials.js'

export type CardMaterial = MeshToonMaterial | MeshBasicMaterial
export type EntityMaterial = Material | Material[]
export type EntityMesh = Mesh<BufferGeometry, EntityMaterial>

// One slot in an instanced batch (`board-3d-node-batches.ts`): `key`
// identifies the batch so the flush can detect visual/frame migrations;
// `casterKey` (spec + castShadow, no frame geometry) decides whether a
// migration changed the shadow-map caster set; `release` returns the
// slot (zeroed, invisible) for reuse.
export type NodeBatchSlot = {
  key: string
  casterKey: string
  index: number
  release: () => void
  // Plate batches share one slot key across specs — the flush compares
  // this against node.specKey to know when the per-instance atlas rect /
  // wall tint must be rewritten. Unused by the per-spec batches.
  specKey?: string
  // Merged-frame voxel batches keep the last `aFrame` value written for
  // this slot; the flush rewrites it when node.frameIndex moved.
  frameIx?: number
}

// Whole-board celebration pulses (hop/slump): the runtime staggers them
// per node, rippling outward from the effect origin. Rule pulses fire
// per card as its text joins ('rule-on', golden pop) or leaves
// ('rule-off', grey sag) an active rule — the sync layer arms them.
export type NodePulseKind = 'hop' | 'slump' | 'rule-on' | 'rule-off'

export type EntityNode = {
  // Neither `mesh` nor `shadow` sits in the scene graph: they stay real
  // Object3Ds so pose/sync keep their transform semantics, while the
  // instanced batches mirror their matrices into slots. `mesh.parent` is
  // still the entity group — the card-facing basis reads it.
  mesh: EntityMesh
  cardSlot: NodeBatchSlot | null
  shadowSlot: NodeBatchSlot | null
  // Scene-attached parent for a visible rim — instancing drops the
  // mesh-child relation, so the flush replays the node's transform on
  // this anchor and reparents the outline under it.
  outlineAnchor: Object3D | null
  // Inverted-hull rim child of `mesh`: same geometry, per-spec BackSide
  // material tinted the card colour's inverse, inflated by
  // YOU_OUTLINE_SCALE — visible only while the item sits on a control
  // layer (you/you2/3d). Geometry tracks the mesh's (spec swaps and idle
  // frame steps) so the rim never lags a pose; the idle tick pulses its
  // scale and tint in lockstep across the board.
  outline: Mesh<BufferGeometry, MeshBasicMaterial>
  // Card colour and its inverse — cached per spec like fxColors so the
  // pulse lerp needs no spec lookup at tick time.
  outlineTint: EntityOutlineTint
  shadow: Mesh<PlaneGeometry, MeshBasicMaterial>
  shadowMaterial: MeshBasicMaterial
  specKey: string
  // Atlas binding for text-plate nodes (null for voxels): the batch layer
  // draws them through the single shared plate InstancedMesh — see
  // `board-3d-plate-atlas.ts` and the `plate` key in node-batches.
  plate: PlateBinding | null
  frameGeometries: BufferGeometry[]
  // Current animation frame: the instanced batch reads it into the
  // per-instance `aFrame` attribute; the outline shell swaps to the
  // matching real geometry in frameGeometries.
  frameIndex: number
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
  // Whether the item's text currently forms an active rule — the sync
  // layer diffs this against the state's activeTextIds and arms a
  // rule-on/rule-off pulse on transitions. Set silently for new nodes
  // so board entry doesn't fire a rule storm on top of the spawn sweep.
  ruleActive: boolean
  // Mirror of the card's struck (overridden-only) face; becoming
  // overridden sags the card, being freed pops it back up.
  ruleOverridden: boolean
  // Sorted `props` signature from the last sync — the diff that makes
  // object entities react when rules change their nature (every wall
  // ripples the moment `wall is stop` forms or breaks).
  propSig: string
  // One-shot flag like spawnFxDone: the rule sparkle/poof fires once per
  // armed pulse, at the moment the pulse actually starts (staggers push
  // pulseStartMs into the future).
  ruleFxDone: boolean
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
  getVisual: (
    item: Item,
    overridden?: boolean,
    tileMask?: number,
    active?: boolean,
  ) => EntityVisual
}

export type SyncEntityNodesDeps = {
  nodes: Map<number, EntityNode>
  getVisual: (
    item: Item,
    overridden?: boolean,
    tileMask?: number,
    active?: boolean,
  ) => EntityVisual
  createNode: (
    item: Item,
    nowMs: number,
    spawnDelayMs?: number,
    tileMask?: number,
    overridden?: boolean,
    active?: boolean,
  ) => EntityNode
  camera: Camera
  // Set when the camera moved since the last pose pass — idle nodes must be
  // re-posed even though their board targets did not change.
  cameraChanged?: boolean
}

export type PoseStepResult = {
  animating: boolean
  finishedLeaving: boolean
}

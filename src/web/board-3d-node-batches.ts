import {
  Color,
  DoubleSide,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Object3D,
} from 'three'

import { BOARD3D_SHADOW_CONFIG } from './board-3d-config-shadow.js'

import type { CanvasTexture, Group, PlaneGeometry } from 'three'
import type { EntityNode, NodeBatchSlot } from './board-3d-node-types.js'

const {
  ENTITY_SHADOW_COLOR,
  ENTITY_SHADOW_OPACITY,
  ENTITY_SHADOW_ALPHA_TEST,
} = BOARD3D_SHADOW_CONFIG

const INITIAL_CAPACITY = 64
const ZERO_MATRIX = new Matrix4().makeScale(0, 0, 0)

// Per-instance alpha for a shared transparent instanced material — blob
// shadows and fx particles both fade through the same shader patch.
// `cacheKey` must be unique per material so the program cache keeps the
// variants apart.
export const patchInstancedOpacity = (
  material: MeshBasicMaterial,
  cacheKey: string,
): void => {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute float aOpacity;\nvarying float vOpacity;',
      )
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvOpacity = aOpacity;',
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying float vOpacity;',
      )
      .replace(
        '#include <color_fragment>',
        '#include <color_fragment>\n\tdiffuseColor.a *= vOpacity;',
      )
  }
  material.customProgramCacheKey = () => cacheKey
}

export const createOpacityAttribute = (
  capacity: number,
): InstancedBufferAttribute => {
  const attribute = new InstancedBufferAttribute(
    new Float32Array(capacity),
    1,
  )
  attribute.setUsage(DynamicDrawUsage)
  return attribute
}

type CardBatch = {
  key: string
  mesh: InstancedMesh
  free: number[]
  highWater: number
  // Dirty slot range pending upload: Infinity/-1 means clean. Fresh
  // buffers start fully dirty so their first flush uploads everything.
  writeMin: number
  writeMax: number
}

export type EntityBatches = {
  // Mirrors dirty nodes' off-scene transforms into their instanced slots
  // and reparents visible rims onto scene-attached anchors. `dirty ===
  // null` rewrites every node (post-sync); a set scopes writes to the
  // nodes posed this tick. Slots are always assigned/released — only
  // the matrix uploads are gated. Returns true when instance↔batch
  // structure changed — the shadow-map pass must refresh alongside it.
  flush: (
    nodes: ReadonlyMap<number, EntityNode>,
    dirty: ReadonlySet<EntityNode> | null,
  ) => boolean
  dispose: () => void
}

// Cards share geometry+material through the visual cache, so identical
// specs collapse into one instanced draw instead of one mesh per item.
// A batch's key (`specKey|geometry|castShadow`) is everything the instanced
// draw needs — a node whose visual or frame changed migrates to the batch
// matching its new key.
export const createEntityBatches = (parent: Group): EntityBatches => {
  const batches = new Map<string, CardBatch>()

  const markWrite = (batch: CardBatch, index: number): void => {
    batch.writeMin = Math.min(batch.writeMin, index)
    batch.writeMax = Math.max(batch.writeMax, index)
  }

  const growBatch = (batch: CardBatch): void => {
    const old = batch.mesh
    const capacity = old.instanceMatrix.count * 2
    const next = new InstancedMesh(old.geometry, old.material, capacity)
    next.instanceMatrix.setUsage(DynamicDrawUsage)
    next.instanceMatrix.array.set(old.instanceMatrix.array)
    next.castShadow = old.castShadow
    next.receiveShadow = old.receiveShadow
    next.frustumCulled = false
    next.matrixAutoUpdate = false
    next.count = old.count
    // The replacement buffer must upload in full once — mark the whole
    // range dirty so the flush's partial-upload path covers it.
    batch.writeMin = 0
    batch.writeMax = capacity - 1
    // Descending push keeps pop() allocating the lowest free index, so
    // highWater stays compact instead of jumping to the new capacity.
    for (let i = capacity - 1; i >= old.instanceMatrix.count; i -= 1) {
      batch.free.push(i)
      next.setMatrixAt(i, ZERO_MATRIX)
    }
    parent.add(next)
    parent.remove(old)
    old.dispose()
    batch.mesh = next
  }

  const acquire = (batch: CardBatch): NodeBatchSlot => {
    if (batch.free.length === 0) growBatch(batch)
    const index = batch.free.pop()
    if (index === undefined) throw new Error('unreachable')
    batch.highWater = Math.max(batch.highWater, index + 1)
    batch.mesh.count = batch.highWater
    markWrite(batch, index)
    return {
      key: batch.key,
      index,
      release: () => {
        batch.mesh.setMatrixAt(index, ZERO_MATRIX)
        markWrite(batch, index)
        batch.free.push(index)
      },
    }
  }

  const batchFor = (node: EntityNode, key: string): CardBatch => {
    let batch = batches.get(key)
    if (batch) return batch
    const mesh = new InstancedMesh(
      node.mesh.geometry,
      node.mesh.material,
      INITIAL_CAPACITY,
    )
    mesh.instanceMatrix.setUsage(DynamicDrawUsage)
    // castShadow arrives through the key: ground-hug tiles land in their
    // own batch so instancing keeps the per-node caster split identical.
    mesh.castShadow = node.mesh.castShadow
    mesh.receiveShadow = true
    // Instances span the whole board; per-object culling would need a
    // bounds union that costs more than it saves on this camera.
    mesh.frustumCulled = false
    // The instanced container itself never moves — only its slots do.
    mesh.matrixAutoUpdate = false
    mesh.count = 0
    for (let i = 0; i < INITIAL_CAPACITY; i += 1) {
      mesh.setMatrixAt(i, ZERO_MATRIX)
    }
    parent.add(mesh)
    batch = {
      key,
      mesh,
      free: [],
      highWater: 0,
      // Fresh buffer: the first flush uploads the whole range once.
      writeMin: 0,
      writeMax: INITIAL_CAPACITY - 1,
    }
    for (let i = INITIAL_CAPACITY - 1; i >= 0; i -= 1) batch.free.push(i)
    batches.set(key, batch)
    return batch
  }

  const flush = (
    nodes: ReadonlyMap<number, EntityNode>,
    dirty: ReadonlySet<EntityNode> | null,
  ): boolean => {
    let structureChanged = false
    for (const node of nodes.values()) {
      const mesh = node.mesh
      const key = `${node.specKey}|${mesh.geometry.uuid}|${mesh.castShadow ? 1 : 0}`
      let slot = node.cardSlot
      let migrated = false
      if (!slot || slot.key !== key) {
        slot?.release()
        slot = acquire(batchFor(node, key))
        node.cardSlot = slot
        migrated = true
        structureChanged = true
      }
      const batch = batches.get(slot.key)
      if (!batch) continue
      // A settled node keeps last tick's matrix; only posed/migrated
      // nodes pay the compose+copy and mark the buffer range dirty.
      const nodeDirty = dirty === null || dirty.has(node) || migrated
      if (nodeDirty) {
        mesh.updateMatrix()
        batch.mesh.setMatrixAt(slot.index, mesh.matrix)
        markWrite(batch, slot.index)
      }

      // The rim is a real mesh again — instancing dropped the child
      // relation, so a lazily attached anchor replays the node's transform
      // while the rim's own scale pulse stays untouched.
      if (node.outline?.visible === true) {
        const anchor = (node.outlineAnchor ??= new Object3D())
        const justAttached = anchor.parent !== parent
        if (justAttached) parent.add(anchor)
        if (nodeDirty || justAttached) {
          anchor.position.copy(mesh.position)
          anchor.quaternion.copy(mesh.quaternion)
          anchor.scale.copy(mesh.scale)
          if (node.outline.parent !== anchor) anchor.add(node.outline)
        }
      }
    }
    for (const batch of batches.values()) {
      if (batch.writeMin > batch.writeMax) continue
      batch.mesh.instanceMatrix.addUpdateRange(
        batch.writeMin * 16,
        (batch.writeMax - batch.writeMin + 1) * 16,
      )
      batch.mesh.instanceMatrix.needsUpdate = true
      batch.writeMin = Infinity
      batch.writeMax = -1
    }
    return structureChanged
  }

  const dispose = (): void => {
    for (const batch of batches.values()) {
      parent.remove(batch.mesh)
      batch.mesh.dispose()
    }
    batches.clear()
  }

  return { flush, dispose }
}

export type ShadowBatch = {
  flush: (
    nodes: ReadonlyMap<number, EntityNode>,
    dirty: ReadonlySet<EntityNode> | null,
  ) => void
  dispose: () => void
}

// Every blob shadow shares one quad+texture; only transform and opacity
// differ per card, so a single instanced draw plus an `aOpacity` attribute
// replaces the per-node mesh+material pair entirely.
export const createShadowBatch = (
  parent: Group,
  geometry: PlaneGeometry,
  texture: CanvasTexture,
): ShadowBatch => {
  const material = new MeshBasicMaterial({
    map: texture,
    color: new Color(ENTITY_SHADOW_COLOR),
    transparent: true,
    opacity: ENTITY_SHADOW_OPACITY,
    depthWrite: false,
    alphaTest: ENTITY_SHADOW_ALPHA_TEST,
    side: DoubleSide,
  })
  patchInstancedOpacity(material, 'board3d-shadow-batch')

  let opacity = createOpacityAttribute(INITIAL_CAPACITY)
  geometry.setAttribute('aOpacity', opacity)

  let mesh = new InstancedMesh(geometry, material, INITIAL_CAPACITY)
  mesh.instanceMatrix.setUsage(DynamicDrawUsage)
  mesh.castShadow = false
  mesh.receiveShadow = false
  mesh.frustumCulled = false
  mesh.matrixAutoUpdate = false
  mesh.count = 0
  for (let i = 0; i < INITIAL_CAPACITY; i += 1) {
    mesh.setMatrixAt(i, ZERO_MATRIX)
  }
  parent.add(mesh)

  const free: number[] = []
  for (let i = INITIAL_CAPACITY - 1; i >= 0; i -= 1) free.push(i)
  let highWater = 0
  // Dirty slot range pending upload — the fresh buffer starts fully
  // dirty so the first flush uploads everything once.
  let writeMin = 0
  let writeMax = INITIAL_CAPACITY - 1

  const markWrite = (index: number): void => {
    writeMin = Math.min(writeMin, index)
    writeMax = Math.max(writeMax, index)
  }

  const grow = (): void => {
    const old = mesh
    const capacity = old.instanceMatrix.count * 2
    const next = new InstancedMesh(geometry, material, capacity)
    next.instanceMatrix.setUsage(DynamicDrawUsage)
    next.instanceMatrix.array.set(old.instanceMatrix.array)
    next.castShadow = false
    next.receiveShadow = false
    next.frustumCulled = false
    next.matrixAutoUpdate = false
    next.count = old.count
    for (let i = capacity - 1; i >= old.instanceMatrix.count; i -= 1) {
      free.push(i)
      next.setMatrixAt(i, ZERO_MATRIX)
    }
    const nextOpacity = new InstancedBufferAttribute(
      new Float32Array(capacity),
      1,
    )
    nextOpacity.setUsage(DynamicDrawUsage)
    nextOpacity.array.set(opacity.array)
    opacity = nextOpacity
    geometry.setAttribute('aOpacity', opacity)
    // New buffers upload in full once.
    writeMin = 0
    writeMax = capacity - 1
    parent.add(next)
    parent.remove(old)
    old.dispose()
    mesh = next
  }

  const acquire = (): NodeBatchSlot => {
    if (free.length === 0) grow()
    const index = free.pop()
    if (index === undefined) throw new Error('unreachable')
    highWater = Math.max(highWater, index + 1)
    mesh.count = highWater
    markWrite(index)
    return {
      key: 'shadow',
      index,
      release: () => {
        mesh.setMatrixAt(index, ZERO_MATRIX)
        opacity.setX(index, 0)
        markWrite(index)
        free.push(index)
      },
    }
  }

  const flush = (
    nodes: ReadonlyMap<number, EntityNode>,
    dirty: ReadonlySet<EntityNode> | null,
  ): void => {
    for (const node of nodes.values()) {
      let slot = node.shadowSlot
      let acquired = false
      if (!slot) {
        slot = acquire()
        node.shadowSlot = slot
        acquired = true
      }
      if (dirty !== null && !dirty.has(node) && !acquired) continue
      node.shadow.updateMatrix()
      mesh.setMatrixAt(slot.index, node.shadow.matrix)
      // `shadow.visible` folds into the alpha write — a hidden shadow is
      // a fully transparent instance, matching the old culled mesh.
      opacity.setX(
        slot.index,
        node.shadow.visible ? node.shadowMaterial.opacity : 0,
      )
      markWrite(slot.index)
    }
    if (writeMin > writeMax) return
    mesh.instanceMatrix.addUpdateRange(
      writeMin * 16,
      (writeMax - writeMin + 1) * 16,
    )
    mesh.instanceMatrix.needsUpdate = true
    opacity.addUpdateRange(writeMin, writeMax - writeMin + 1)
    opacity.needsUpdate = true
    writeMin = Infinity
    writeMax = -1
  }

  const dispose = (): void => {
    parent.remove(mesh)
    mesh.dispose()
    material.dispose()
    geometry.deleteAttribute('aOpacity')
  }

  return { flush, dispose }
}

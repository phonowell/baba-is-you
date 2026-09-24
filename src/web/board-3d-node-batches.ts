import {
  Color,
  DoubleSide,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  MeshDepthMaterial,
  Object3D,
} from 'three'

import { BOARD3D_SHADOW_CONFIG } from './board-3d-config-shadow.js'
import { patchVoxelFrameSelect } from './pixel-sprites/voxel.js'

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
  // Plate batches (`plate|<castShadow>`) are the shared atlas draw: every
  // text card lands here regardless of spec, carrying its own aCell +
  // aTint per instance instead of a per-spec material.
  plate?: boolean
  cell?: InstancedBufferAttribute
  tint?: InstancedBufferAttribute
  // Merged-frame voxel batches carry the per-instance `aFrame` selector;
  // the geometry's aFrameIx vertex tag plus the frame-select shader patch
  // collapse all non-current triangles per instance.
  frame?: InstancedBufferAttribute
}

export type EntityBatches = {
  // Mirrors dirty nodes' off-scene transforms into their instanced slots
  // and reparents visible rims onto scene-attached anchors. `dirty ===
  // null` rewrites every node (post-sync); a set scopes writes to the
  // nodes posed this tick. Slots are always assigned/released — only
  // the matrix uploads are gated. Returns true when the shadow-map
  // caster set changed: node added/removed, spec or castShadow swapped.
  // A pure wobble-frame geometry swap keeps the same spec and moves the
  // silhouette by sub-texel amounts, so it does not count — the shadow
  // pass skips those ticks entirely.
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
  // Shadow pass needs the same frame collapse as the lit pass or the
  // merged geometry would cast the union silhouette of all frames.
  const frameDepthMaterial = new MeshDepthMaterial()
  patchVoxelFrameSelect(frameDepthMaterial, 'voxel-frames-depth')

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
    if (batch.plate && batch.cell && batch.tint) {
      // The instanced attributes grow in lockstep with the matrix buffer —
      // the batch owns the cloned geometry, so swapping attributes here
      // touches no other batch.
      const cell = new InstancedBufferAttribute(
        new Float32Array(capacity * 2),
        2,
      )
      const tint = new InstancedBufferAttribute(
        new Float32Array(capacity * 3),
        3,
      )
      cell.setUsage(DynamicDrawUsage)
      tint.setUsage(DynamicDrawUsage)
      cell.array.set(batch.cell.array)
      tint.array.set(batch.tint.array)
      next.geometry.setAttribute('aCell', cell)
      next.geometry.setAttribute('aTint', tint)
      batch.cell = cell
      batch.tint = tint
    }
    if (batch.frame) {
      const frame = new InstancedBufferAttribute(
        new Float32Array(capacity),
        1,
      )
      frame.setUsage(DynamicDrawUsage)
      frame.array.set(batch.frame.array)
      next.geometry.setAttribute('aFrame', frame)
      batch.frame = frame
    }
    next.customDepthMaterial = old.customDepthMaterial
    parent.add(next)
    parent.remove(old)
    old.dispose()
    batch.mesh = next
  }

  const acquire = (batch: CardBatch, casterKey: string): NodeBatchSlot => {
    if (batch.free.length === 0) growBatch(batch)
    const index = batch.free.pop()
    if (index === undefined) throw new Error('unreachable')
    batch.highWater = Math.max(batch.highWater, index + 1)
    batch.mesh.count = batch.highWater
    markWrite(batch, index)
    return {
      key: batch.key,
      casterKey,
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
    const plate = key.startsWith('plate|')
    const framed = !plate && node.mesh.geometry.getAttribute('aFrameIx') !== undefined
    // Plate batches share the one plate geometry across every spec, but
    // the per-instance attributes live on the geometry — clone it so the
    // ≤2 plate batches (casters and non-casters) never share attr space.
    // Merged-frame geometries get cloned for the same reason: aFrame is
    // per-batch storage.
    const geometry =
      plate || framed ? node.mesh.geometry.clone() : node.mesh.geometry
    const mesh = new InstancedMesh(
      geometry,
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
    if (plate) {
      batch.plate = true
      batch.cell = new InstancedBufferAttribute(
        new Float32Array(INITIAL_CAPACITY * 2),
        2,
      )
      batch.tint = new InstancedBufferAttribute(
        new Float32Array(INITIAL_CAPACITY * 3),
        3,
      )
      batch.cell.setUsage(DynamicDrawUsage)
      batch.tint.setUsage(DynamicDrawUsage)
      geometry.setAttribute('aCell', batch.cell)
      geometry.setAttribute('aTint', batch.tint)
    }
    if (framed) {
      batch.frame = new InstancedBufferAttribute(
        new Float32Array(INITIAL_CAPACITY),
        1,
      )
      batch.frame.setUsage(DynamicDrawUsage)
      geometry.setAttribute('aFrame', batch.frame)
      mesh.customDepthMaterial = frameDepthMaterial
    }
    for (let i = INITIAL_CAPACITY - 1; i >= 0; i -= 1) batch.free.push(i)
    batches.set(key, batch)
    return batch
  }

  const flush = (
    nodes: ReadonlyMap<number, EntityNode>,
    dirty: ReadonlySet<EntityNode> | null,
  ): boolean => {
    let castersChanged = false
    for (const node of nodes.values()) {
      const mesh = node.mesh
      const castShadow = mesh.castShadow ? 1 : 0
      // Atlas-bound plates collapse to one batch per caster flag — every
      // spec draws through it; per-spec batches keep the old keying.
      const plate = node.plate
      const key = plate
        ? `plate|${castShadow}`
        : `${node.specKey}|${mesh.geometry.uuid}|${castShadow}`
      // The plate silhouette never changes with the spec — only the atlas
      // rect does — so a plate↔plate swap must not wake the shadow pass.
      const casterKey = plate
        ? `plate|${castShadow}`
        : `${node.specKey}|${castShadow}`
      let slot = node.cardSlot
      let migrated = false
      if (!slot || slot.key !== key) {
        // The shadow map only cares about the caster set — a frame-swap
        // migration inside the same spec leaves it untouched.
        if (!slot || slot.casterKey !== casterKey) castersChanged = true
        slot?.release()
        slot = acquire(batchFor(node, key), casterKey)
        node.cardSlot = slot
        migrated = true
      }
      const batch = batches.get(slot.key)
      if (!batch) continue
      // Plate slots share one key across specs — the atlas cell and wall
      // tint are rewritten whenever the node's spec actually changed
      // (fresh acquire included: slot.specKey starts undefined).
      if (batch.plate && plate && slot.specKey !== node.specKey) {
        const cell = batch.cell
        const tint = batch.tint
        if (cell && tint) {
          cell.array.set(plate.origin, slot.index * 2)
          tint.array.set(
            [plate.tint.r, plate.tint.g, plate.tint.b],
            slot.index * 3,
          )
          markWrite(batch, slot.index)
          slot.specKey = node.specKey
        }
      }
      // Wobble/frame advance lands here: the per-instance frame selector
      // is rewritten whenever node.frameIndex moved (fresh acquires write
      // it too — slot.frameIx starts undefined).
      if (batch.frame && slot.frameIx !== node.frameIndex) {
        batch.frame.setX(slot.index, node.frameIndex)
        markWrite(batch, slot.index)
        slot.frameIx = node.frameIndex
      }
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
      const count = batch.writeMax - batch.writeMin + 1
      batch.mesh.instanceMatrix.addUpdateRange(batch.writeMin * 16, count * 16)
      batch.mesh.instanceMatrix.needsUpdate = true
      // The instanced attributes cover the same slot range as the matrix
      // buffer — one dirty span drives all three uploads.
      batch.cell?.addUpdateRange(batch.writeMin * 2, count * 2)
      batch.tint?.addUpdateRange(batch.writeMin * 3, count * 3)
      batch.frame?.addUpdateRange(batch.writeMin, count)
      if (batch.cell) batch.cell.needsUpdate = true
      if (batch.tint) batch.tint.needsUpdate = true
      if (batch.frame) batch.frame.needsUpdate = true
      batch.writeMin = Infinity
      batch.writeMax = -1
    }
    return castersChanged
  }

  const dispose = (): void => {
    for (const batch of batches.values()) {
      parent.remove(batch.mesh)
      batch.mesh.dispose()
      // Plate and merged-frame batches own their geometry clone (it
      // carries the per-instance attrs); per-spec batches share cached
      // geometry — never dispose it.
      if (batch.plate || batch.frame) batch.mesh.geometry.dispose()
    }
    frameDepthMaterial.dispose()
    batches.clear()
  }

  return { flush, dispose }
}

export type ShadowBatch = {
  flush: (
    nodes: ReadonlyMap<number, EntityNode>,
    dirty: ReadonlySet<EntityNode> | null,
  ) => void
  // The shared instanced mesh (always parented, usually count 0). The
  // prewarm pass bumps its count to 1 for one render so the patched
  // material's program compiles off the critical path.
  warmupMesh: InstancedMesh
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
      // Blob shadows are receivers, never casters — the key is bookkeeping
      // only, the shadow-map pass never reads it.
      casterKey: 'shadow',
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

  return { flush, warmupMesh: mesh, dispose }
}

import {
  Color,
  DoubleSide,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Vector3,
} from 'three'

import {
  applyCardOrientation,
  cardFacingForParent,
} from './board-3d-card-facing.js'
import { BOARD3D_EFFECTS_CONFIG } from './board-3d-config-effects.js'
import {
  createOpacityAttribute,
  patchInstancedOpacity,
} from './board-3d-node-batches.js'
import {
  clamp01,
  easeOutCubic,
  lerp,
} from './board-3d-shared-math.js'
import { BOARD_FX_MOOD_NEUTRAL } from './board-3d-shared-types.js'

import type { Camera } from 'three'
import type { CardFacing } from './board-3d-card-facing.js'
import type { BoardFxMood } from './board-3d-shared-types.js'

const {
  PARTICLE_MAX,
  PARTICLE_GRAVITY,
  PARTICLE_FLOOR_Z,
  PARTICLE_FADE_START,
  SPAWN_PUFF_COUNT,
  SPAWN_PUFF_LIFE_MS,
  SPAWN_PUFF_SIZE,
  SPAWN_PUFF_WHITE,
  SPAWN_PUFF_WHITE_RATIO,
  SPAWN_PUFF_LATERAL_SPEED,
  SPAWN_PUFF_UP_SPEED,
  SPAWN_PUFF_GRAVITY_SCALE,
  DESPAWN_POOF_COUNT,
  DESPAWN_POOF_LIFE_MS,
  DESPAWN_POOF_SIZE,
  DESPAWN_POOF_LATERAL_SPEED,
  DESPAWN_POOF_UP_SPEED,
  DESPAWN_POOF_GRAVITY_SCALE,
  DESPAWN_POOF_WHITE,
  DESPAWN_POOF_WHITE_RATIO,
  WIN_COLORS,
  WIN_BURST_COUNT,
  WIN_BURST_LIFE_MS,
  WIN_BURST_SIZE,
  WIN_BURST_LATERAL_SPEED,
  WIN_BURST_UP_SPEED,
  WIN_BURST_GRAVITY_SCALE,
  WIN_MOOD_DECAY_MS,
  WIN_BLOOM_PEAK,
  WIN_BLOOM_HOLD,
  WIN_SATURATION_PEAK,
  WIN_SATURATION_HOLD,
  LOSE_COLORS,
  LOSE_ASH_PER_SPOT,
  LOSE_ASH_LIFE_MS,
  LOSE_ASH_SIZE,
  LOSE_ASH_LATERAL_SPEED,
  LOSE_ASH_UP_SPEED,
  LOSE_ASH_GRAVITY_SCALE,
  LOSE_MOOD_FADE_MS,
  LOSE_SATURATION,
  LOSE_BLOOM_DROP,
  LOSE_VIGNETTE_ADD,
  RULE_SPARKLE_COUNT,
  RULE_SPARKLE_LIFE_MS,
  RULE_SPARKLE_SIZE,
  RULE_SPARKLE_LATERAL_SPEED,
  RULE_SPARKLE_UP_SPEED,
  RULE_SPARKLE_GRAVITY_SCALE,
  RULE_SPARKLE_COLORS,
  RULE_PUFF_COUNT,
  RULE_PUFF_LIFE_MS,
  RULE_PUFF_SIZE,
  RULE_PUFF_LATERAL_SPEED,
  RULE_PUFF_UP_SPEED,
  RULE_PUFF_GRAVITY_SCALE,
  RULE_PUFF_COLORS,
} = BOARD3D_EFFECTS_CONFIG

export type BoardFxSpot = {
  x: number
  y: number
  z: number
}

type CreateBoard3dEffectsArgs = {
  // Board-space parent (the world group): particle positions match card
  // coordinates directly.
  parent: Group
  camera: Camera
  setMood: (mood: BoardFxMood) => void
  random?: () => number
}

export type Board3dEffects = {
  spawnPuff: (x: number, y: number, z: number, colors: readonly string[]) => void
  despawnPoof: (x: number, y: number, z: number, colors: readonly string[]) => void
  ruleSparkle: (x: number, y: number, z: number) => void
  rulePuff: (x: number, y: number, z: number) => void
  playWin: (spots: readonly BoardFxSpot[]) => void
  playLose: (spots: readonly BoardFxSpot[]) => void
  neutralMood: () => void
  // Advances particles and the mood timeline; true while either is live so
  // the runtime keeps the RAF loop (and renders) going.
  update: (nowMs: number) => boolean
  // The shared instanced particle mesh (always parented, usually count 0).
  // The prewarm pass bumps its count to 1 for one render so the patched
  // material's program compiles off the critical path.
  warmupMesh: InstancedMesh
  clear: () => void
  dispose: () => void
}

type FxParticle = {
  // Off-scene transform carrier — the visible quad is an instance slot;
  // the mesh just composes the per-frame matrix for it.
  mesh: Mesh<PlaneGeometry, MeshBasicMaterial>
  color: Color
  active: boolean
  originX: number
  originY: number
  originZ: number
  velX: number
  velY: number
  velZ: number
  gravityScale: number
  roll: number
  rollSpeed: number
  startMs: number
  lifeMs: number
  size: number
  opacity: number
  viewZ: number
}

type MoodKind = 'win' | 'lose'

const FALLBACK_COLORS = ['#ffffff']
const ZERO_MATRIX = new Matrix4().makeScale(0, 0, 0)

export const createBoard3dEffects = (
  args: CreateBoard3dEffectsArgs,
): Board3dEffects => {
  const { parent, camera, setMood } = args
  const random = args.random ?? Math.random

  const group = new Group()
  parent.add(group)
  const geometry = new PlaneGeometry(1, 1)
  const particles: FxParticle[] = []
  // Reused per update: live particles are depth-sorted into compact
  // instance ranks (back-to-front, matching the old per-mesh transparent
  // sort) instead of keeping one draw per particle.
  const live: FxParticle[] = []
  const camPos = new Vector3()
  const camDir = new Vector3()
  const worldPos = new Vector3()
  let liveCount = 0

  // One instanced draw for every particle: transform per slot, colour per
  // slot (`instanceColor`), per-particle fade through the shared `aOpacity`
  // patch — replacing up to PARTICLE_MAX mesh draws with one.
  const material = new MeshBasicMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
  })
  patchInstancedOpacity(material, 'board3d-fx-particles')
  const opacity = createOpacityAttribute(PARTICLE_MAX)
  geometry.setAttribute('aOpacity', opacity)
  const instanced = new InstancedMesh(geometry, material, PARTICLE_MAX)
  instanced.instanceMatrix.setUsage(DynamicDrawUsage)
  instanced.frustumCulled = false
  instanced.matrixAutoUpdate = false
  const white = new Color(0xffffff)
  for (let i = 0; i < PARTICLE_MAX; i += 1) {
    instanced.setMatrixAt(i, ZERO_MATRIX)
    instanced.setColorAt(i, white)
  }
  instanced.count = 0
  instanced.instanceColor?.setUsage(DynamicDrawUsage)
  group.add(instanced)

  let mood: { kind: MoodKind; startMs: number } | null = null
  let disposed = false

  const acquire = (): FxParticle | null => {
    for (const particle of particles) {
      if (!particle.active) return particle
    }
    if (particles.length < PARTICLE_MAX) {
      const mesh = new Mesh(geometry, material)
      mesh.parent = group
      const particle: FxParticle = {
        mesh,
        color: new Color(0xffffff),
        active: false,
        originX: 0,
        originY: 0,
        originZ: 0,
        velX: 0,
        velY: 0,
        velZ: 0,
        gravityScale: 1,
        roll: 0,
        rollSpeed: 0,
        startMs: 0,
        lifeMs: 1,
        size: 0.1,
        opacity: 1,
        viewZ: 0,
      }
      particles.push(particle)
      return particle
    }
    // Pool exhausted: recycle the oldest live particle.
    let oldest: FxParticle | null = null
    for (const particle of particles) {
      if (!oldest || particle.startMs < oldest.startMs) oldest = particle
    }
    return oldest
  }

  const emit = (
    nowMs: number,
    spec: {
      x: number
      y: number
      z: number
      velX: number
      velY: number
      velZ: number
      gravityScale: number
      lifeMs: number
      size: number
      color: string
    },
  ): void => {
    const particle = acquire()
    if (!particle) return
    if (!particle.active) liveCount += 1
    particle.active = true
    particle.originX = spec.x
    particle.originY = spec.y
    particle.originZ = spec.z
    particle.velX = spec.velX
    particle.velY = spec.velY
    particle.velZ = spec.velZ
    particle.gravityScale = spec.gravityScale
    particle.roll = random() * Math.PI * 2
    particle.rollSpeed = (random() - 0.5) * 9
    particle.startMs = nowMs
    particle.lifeMs = spec.lifeMs
    particle.size = spec.size
    particle.color.set(spec.color)
    particle.mesh.position.set(spec.x, spec.y, spec.z)
    instanced.count = liveCount
  }

  const pickColor = (
    colors: readonly string[],
    index: number,
  ): string => colors[index % colors.length] ?? '#ffffff'

  // Every celebration/collapse shares one shape: `count` particles fan
  // out around the card face, lift by a scaled up-speed, and die on a
  // jittered life/size clock. What differs between a spawn puff and the
  // win fountain is the tuning table, not the emit loop.
  type RadialBurstTuning = {
    count: number
    // 'ring' spaces particles evenly around the circle (plus jitter);
    // 'random' rolls a fresh angle per particle.
    angle: 'ring' | 'random'
    ringJitter: number
    lateralSpeed: number
    // speed * (lo + random() * (hi - lo))
    lateral: readonly [number, number]
    upSpeed: number
    up: readonly [number, number]
    gravityScale: number
    lifeMs: number
    life: readonly [number, number]
    size: number
    sizeScale: readonly [number, number]
    // ± jitter applied to the emit origin (0 keeps it exact).
    originJitter: number
    white?: { color: string; ratio: number }
  }

  const spawnRadialBurst = (
    nowMs: number,
    x: number,
    y: number,
    z: number,
    colors: readonly string[],
    tuning: RadialBurstTuning,
  ): void => {
    const spread = (range: readonly [number, number]): number =>
      range[0] + random() * (range[1] - range[0])
    for (let i = 0; i < tuning.count; i += 1) {
      const angle =
        tuning.angle === 'ring'
          ? (i / tuning.count) * Math.PI * 2 + random() * tuning.ringJitter
          : random() * Math.PI * 2
      const lateral = tuning.lateralSpeed * spread(tuning.lateral)
      const jitter = tuning.originJitter
      emit(nowMs, {
        x: jitter > 0 ? x + (random() - 0.5) * jitter : x,
        y: jitter > 0 ? y + (random() - 0.5) * jitter : y,
        z,
        velX: Math.cos(angle) * lateral,
        velY: Math.sin(angle) * lateral,
        velZ: tuning.upSpeed * spread(tuning.up),
        gravityScale: tuning.gravityScale,
        lifeMs: tuning.lifeMs * spread(tuning.life),
        size: tuning.size * spread(tuning.sizeScale),
        color:
          tuning.white && random() < tuning.white.ratio
            ? tuning.white.color
            : pickColor(colors, i),
      })
    }
  }

  const SPAWN_PUFF_TUNING: RadialBurstTuning = {
    count: SPAWN_PUFF_COUNT,
    angle: 'ring',
    ringJitter: 0.7,
    lateralSpeed: SPAWN_PUFF_LATERAL_SPEED,
    lateral: [0.65, 1.35],
    upSpeed: SPAWN_PUFF_UP_SPEED,
    up: [0.5, 1.5],
    gravityScale: SPAWN_PUFF_GRAVITY_SCALE,
    lifeMs: SPAWN_PUFF_LIFE_MS,
    life: [0.85, 1.15],
    size: SPAWN_PUFF_SIZE,
    sizeScale: [0.8, 1.3],
    originJitter: 0,
    white: { color: SPAWN_PUFF_WHITE, ratio: SPAWN_PUFF_WHITE_RATIO },
  }
  const DESPAWN_POOF_TUNING: RadialBurstTuning = {
    count: DESPAWN_POOF_COUNT,
    angle: 'random',
    ringJitter: 0,
    lateralSpeed: DESPAWN_POOF_LATERAL_SPEED,
    lateral: [0.4, 1.3],
    upSpeed: DESPAWN_POOF_UP_SPEED,
    up: [0.4, 1.3],
    gravityScale: DESPAWN_POOF_GRAVITY_SCALE,
    lifeMs: DESPAWN_POOF_LIFE_MS,
    life: [0.8, 1.2],
    size: DESPAWN_POOF_SIZE,
    sizeScale: [0.75, 1.35],
    originJitter: 0,
    white: { color: DESPAWN_POOF_WHITE, ratio: DESPAWN_POOF_WHITE_RATIO },
  }
  const RULE_SPARKLE_TUNING: RadialBurstTuning = {
    count: RULE_SPARKLE_COUNT,
    angle: 'ring',
    ringJitter: 0.5,
    lateralSpeed: RULE_SPARKLE_LATERAL_SPEED,
    lateral: [0.55, 1.35],
    upSpeed: RULE_SPARKLE_UP_SPEED,
    up: [0.6, 1.4],
    gravityScale: RULE_SPARKLE_GRAVITY_SCALE,
    lifeMs: RULE_SPARKLE_LIFE_MS,
    life: [0.8, 1.2],
    size: RULE_SPARKLE_SIZE,
    sizeScale: [0.75, 1.35],
    originJitter: 0,
  }
  const RULE_PUFF_TUNING: RadialBurstTuning = {
    count: RULE_PUFF_COUNT,
    angle: 'random',
    ringJitter: 0,
    lateralSpeed: RULE_PUFF_LATERAL_SPEED,
    lateral: [0.4, 1.3],
    upSpeed: RULE_PUFF_UP_SPEED,
    up: [0.4, 1.2],
    gravityScale: RULE_PUFF_GRAVITY_SCALE,
    lifeMs: RULE_PUFF_LIFE_MS,
    life: [0.8, 1.3],
    size: RULE_PUFF_SIZE,
    sizeScale: [0.75, 1.35],
    originJitter: 0.25,
  }
  const WIN_BURST_TUNING: RadialBurstTuning = {
    count: WIN_BURST_COUNT,
    angle: 'random',
    ringJitter: 0,
    lateralSpeed: WIN_BURST_LATERAL_SPEED,
    lateral: [0, 1],
    upSpeed: WIN_BURST_UP_SPEED,
    up: [0.65, 1.35],
    gravityScale: WIN_BURST_GRAVITY_SCALE,
    lifeMs: WIN_BURST_LIFE_MS,
    life: [0.8, 1.25],
    size: WIN_BURST_SIZE,
    sizeScale: [0.8, 1.3],
    originJitter: 0,
  }
  const LOSE_ASH_TUNING: RadialBurstTuning = {
    count: LOSE_ASH_PER_SPOT,
    angle: 'random',
    ringJitter: 0,
    lateralSpeed: LOSE_ASH_LATERAL_SPEED,
    lateral: [0, 1],
    upSpeed: LOSE_ASH_UP_SPEED,
    up: [0.5, 1.4],
    gravityScale: LOSE_ASH_GRAVITY_SCALE,
    lifeMs: LOSE_ASH_LIFE_MS,
    life: [0.8, 1.3],
    size: LOSE_ASH_SIZE,
    sizeScale: [0.7, 1.4],
    originJitter: 0.3,
  }

  // Ring puff: particles burst outward along the card face, slight lift.
  const spawnPuff = (
    x: number,
    y: number,
    z: number,
    colors: readonly string[],
  ): void => {
    if (disposed) return
    const palette = colors.length > 0 ? colors : FALLBACK_COLORS
    spawnRadialBurst(performance.now(), x, y, z, palette, SPAWN_PUFF_TUNING)
  }

  // Poof: faster scatter mixed with white — the classic destruction puff.
  const despawnPoof = (
    x: number,
    y: number,
    z: number,
    colors: readonly string[],
  ): void => {
    if (disposed) return
    const palette = colors.length > 0 ? colors : FALLBACK_COLORS
    spawnRadialBurst(performance.now(), x, y, z, palette, DESPAWN_POOF_TUNING)
  }

  // Golden ring when a word card joins an active rule — a tighter, more
  // upward cousin of the spawn puff, always in the gilt palette so a
  // forming rule reads the same on every card colour.
  const ruleSparkle = (x: number, y: number, z: number): void => {
    if (disposed) return
    spawnRadialBurst(
      performance.now(),
      x,
      y,
      z,
      RULE_SPARKLE_COLORS,
      RULE_SPARKLE_TUNING,
    )
  }

  // Dim motes when a word card drops out of a rule — a few grey squares
  // sighing off rather than a burst: a loss, not a celebration.
  const rulePuff = (x: number, y: number, z: number): void => {
    if (disposed) return
    spawnRadialBurst(
      performance.now(),
      x,
      y,
      z,
      RULE_PUFF_COLORS,
      RULE_PUFF_TUNING,
    )
  }

  // Win fountain: tight lateral spread, strong lift, gold palette.
  const playWin = (spots: readonly BoardFxSpot[]): void => {
    if (disposed) return
    const nowMs = performance.now()
    for (const spot of spots) {
      spawnRadialBurst(nowMs, spot.x, spot.y, spot.z, WIN_COLORS, WIN_BURST_TUNING)
    }
    mood = { kind: 'win', startMs: nowMs }
  }

  // Lose: slow ash motes drifting up off the cards while the frame greys.
  const playLose = (spots: readonly BoardFxSpot[]): void => {
    if (disposed) return
    const nowMs = performance.now()
    for (const spot of spots) {
      spawnRadialBurst(nowMs, spot.x, spot.y, spot.z, LOSE_COLORS, LOSE_ASH_TUNING)
    }
    mood = { kind: 'lose', startMs: nowMs }
  }

  const neutralMood = (): void => {
    mood = null
    setMood(BOARD_FX_MOOD_NEUTRAL)
  }

  const updateMood = (nowMs: number): boolean => {
    if (!mood) return false
    if (mood.kind === 'win') {
      const t = clamp01((nowMs - mood.startMs) / WIN_MOOD_DECAY_MS)
      const eased = easeOutCubic(t)
      setMood({
        bloomBoost: lerp(WIN_BLOOM_PEAK, WIN_BLOOM_HOLD, eased),
        saturationAdd: lerp(WIN_SATURATION_PEAK, WIN_SATURATION_HOLD, eased),
        vignetteAdd: 0,
      })
    } else {
      const t = clamp01((nowMs - mood.startMs) / LOSE_MOOD_FADE_MS)
      const eased = easeOutCubic(t)
      setMood({
        bloomBoost: lerp(0, LOSE_BLOOM_DROP, eased),
        saturationAdd: lerp(0, LOSE_SATURATION, eased),
        vignetteAdd: lerp(0, LOSE_VIGNETTE_ADD, eased),
      })
    }
    const duration =
      mood.kind === 'win' ? WIN_MOOD_DECAY_MS : LOSE_MOOD_FADE_MS
    if (nowMs - mood.startMs >= duration) mood = null
    return true
  }

  const updateParticles = (nowMs: number): boolean => {
    // All particles share the group parent — one camera-facing basis and
    // one camera basis per update instead of per particle.
    let cardFacing: CardFacing | undefined
    camera.getWorldPosition(camPos)
    camera.getWorldDirection(camDir)
    group.updateMatrixWorld()
    live.length = 0
    for (const particle of particles) {
      if (!particle.active) continue
      const t = (nowMs - particle.startMs) / particle.lifeMs
      if (t >= 1) {
        particle.active = false
        liveCount -= 1
        continue
      }
      const ts = (nowMs - particle.startMs) / 1000
      const px = particle.originX + particle.velX * ts
      const py = particle.originY + particle.velY * ts
      let pz =
        particle.originZ +
        particle.velZ * ts -
        0.5 * PARTICLE_GRAVITY * particle.gravityScale * ts * ts
      if (pz < PARTICLE_FLOOR_Z) pz = PARTICLE_FLOOR_Z
      // Quick grow-in then a long shrink — the pixel-poof silhouette.
      const grow = clamp01(t / 0.14)
      const shrink = 1 - clamp01((t - 0.14) / 0.86) * 0.8
      const scale = particle.size * grow * shrink
      particle.mesh.position.set(px, py, pz)
      particle.mesh.scale.set(scale, scale, 1)
      particle.opacity =
        t > PARTICLE_FADE_START
          ? 1 - (t - PARTICLE_FADE_START) / (1 - PARTICLE_FADE_START)
          : 1
      applyCardOrientation(
        particle.mesh,
        particle.roll + particle.rollSpeed * ts,
        camera,
        true,
        (cardFacing ??= cardFacingForParent(camera, group)),
      )
      particle.mesh.updateMatrix()
      // Depth along the camera forward — the painter sort below needs a
      // world-space measure, not the board-space z.
      worldPos.set(px, py, pz).applyMatrix4(group.matrixWorld)
      particle.viewZ =
        (worldPos.x - camPos.x) * camDir.x +
        (worldPos.y - camPos.y) * camDir.y +
        (worldPos.z - camPos.z) * camDir.z
      live.push(particle)
    }
    instanced.count = liveCount
    if (live.length === 0) return false
    // Back-to-front ranks: instance index order is the draw order, so the
    // farthest particle writes slot 0 — the same ordering the renderer's
    // transparent sort produced with per-particle meshes.
    live.sort((a, b) => b.viewZ - a.viewZ)
    const instanceColor = instanced.instanceColor
    for (let rank = 0; rank < live.length; rank += 1) {
      const particle = live[rank]
      if (!particle) continue
      instanced.setMatrixAt(rank, particle.mesh.matrix)
      instanced.setColorAt(rank, particle.color)
      opacity.setX(rank, particle.opacity)
    }
    instanced.instanceMatrix.needsUpdate = true
    opacity.needsUpdate = true
    if (instanceColor) instanceColor.needsUpdate = true
    return true
  }

  const update = (nowMs: number): boolean => {
    if (disposed) return false
    const moodActive = updateMood(nowMs)
    const particlesActive = updateParticles(nowMs)
    return moodActive || particlesActive
  }

  const clear = (): void => {
    for (const particle of particles) particle.active = false
    liveCount = 0
    instanced.count = 0
    neutralMood()
  }

  const dispose = (): void => {
    if (disposed) return
    disposed = true
    mood = null
    liveCount = 0
    particles.length = 0
    live.length = 0
    group.remove(instanced)
    instanced.dispose()
    material.dispose()
    geometry.dispose()
    parent.remove(group)
  }

  return {
    spawnPuff,
    despawnPoof,
    ruleSparkle,
    rulePuff,
    playWin,
    playLose,
    neutralMood,
    update,
    warmupMesh: instanced,
    clear,
    dispose,
  }
}

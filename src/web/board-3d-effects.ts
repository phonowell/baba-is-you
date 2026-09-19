import {
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
} from 'three'

import {
  applyCardOrientation,
  cardFacingForParent,
} from './board-3d-card-facing.js'
import { BOARD3D_EFFECTS_CONFIG } from './board-3d-config-effects.js'
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
  playWin: (spots: readonly BoardFxSpot[]) => void
  playLose: (spots: readonly BoardFxSpot[]) => void
  neutralMood: () => void
  // Advances particles and the mood timeline; true while either is live so
  // the runtime keeps the RAF loop (and renders) going.
  update: (nowMs: number) => boolean
  clear: () => void
  dispose: () => void
}

type FxParticle = {
  mesh: Mesh<PlaneGeometry, MeshBasicMaterial>
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
}

type MoodKind = 'win' | 'lose'

const FALLBACK_COLORS = ['#ffffff']

export const createBoard3dEffects = (
  args: CreateBoard3dEffectsArgs,
): Board3dEffects => {
  const { parent, camera, setMood } = args
  const random = args.random ?? Math.random

  const group = new Group()
  parent.add(group)
  const geometry = new PlaneGeometry(1, 1)
  const particles: FxParticle[] = []
  let mood: { kind: MoodKind; startMs: number } | null = null
  let disposed = false

  const acquire = (): FxParticle | null => {
    for (const particle of particles) {
      if (!particle.active) return particle
    }
    if (particles.length < PARTICLE_MAX) {
      const material = new MeshBasicMaterial({
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
      })
      const mesh = new Mesh(geometry, material)
      mesh.visible = false
      group.add(mesh)
      const particle: FxParticle = {
        mesh,
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
    particle.mesh.material.color.set(spec.color)
    particle.mesh.material.opacity = 1
    particle.mesh.position.set(spec.x, spec.y, spec.z)
    particle.mesh.visible = true
  }

  const pickColor = (
    colors: readonly string[],
    index: number,
  ): string => colors[index % colors.length] ?? '#ffffff'

  // Ring puff: particles burst outward along the card face, slight lift.
  const spawnPuff = (
    x: number,
    y: number,
    z: number,
    colors: readonly string[],
  ): void => {
    if (disposed) return
    const palette = colors.length > 0 ? colors : FALLBACK_COLORS
    const nowMs = performance.now()
    for (let i = 0; i < SPAWN_PUFF_COUNT; i += 1) {
      const angle = (i / SPAWN_PUFF_COUNT) * Math.PI * 2 + random() * 0.7
      const lateral = SPAWN_PUFF_LATERAL_SPEED * (0.65 + random() * 0.7)
      emit(nowMs, {
        x,
        y,
        z,
        velX: Math.cos(angle) * lateral,
        velY: Math.sin(angle) * lateral,
        velZ: SPAWN_PUFF_UP_SPEED * (0.5 + random()),
        gravityScale: SPAWN_PUFF_GRAVITY_SCALE,
        lifeMs: SPAWN_PUFF_LIFE_MS * (0.85 + random() * 0.3),
        size: SPAWN_PUFF_SIZE * (0.8 + random() * 0.5),
        color: pickColor(palette, i),
      })
    }
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
    const nowMs = performance.now()
    for (let i = 0; i < DESPAWN_POOF_COUNT; i += 1) {
      const angle = random() * Math.PI * 2
      const lateral = DESPAWN_POOF_LATERAL_SPEED * (0.4 + random() * 0.9)
      const white = random() < DESPAWN_POOF_WHITE_RATIO
      emit(nowMs, {
        x,
        y,
        z,
        velX: Math.cos(angle) * lateral,
        velY: Math.sin(angle) * lateral,
        velZ: DESPAWN_POOF_UP_SPEED * (0.4 + random() * 0.9),
        gravityScale: DESPAWN_POOF_GRAVITY_SCALE,
        lifeMs: DESPAWN_POOF_LIFE_MS * (0.8 + random() * 0.4),
        size: DESPAWN_POOF_SIZE * (0.75 + random() * 0.6),
        color: white ? DESPAWN_POOF_WHITE : pickColor(palette, i),
      })
    }
  }

  // Win fountain: tight lateral spread, strong lift, gold palette.
  const playWin = (spots: readonly BoardFxSpot[]): void => {
    if (disposed) return
    const nowMs = performance.now()
    for (const spot of spots) {
      for (let i = 0; i < WIN_BURST_COUNT; i += 1) {
        const angle = random() * Math.PI * 2
        const lateral = WIN_BURST_LATERAL_SPEED * random()
        emit(nowMs, {
          x: spot.x,
          y: spot.y,
          z: spot.z,
          velX: Math.cos(angle) * lateral,
          velY: Math.sin(angle) * lateral,
          velZ: WIN_BURST_UP_SPEED * (0.65 + random() * 0.7),
          gravityScale: WIN_BURST_GRAVITY_SCALE,
          lifeMs: WIN_BURST_LIFE_MS * (0.8 + random() * 0.45),
          size: WIN_BURST_SIZE * (0.8 + random() * 0.5),
          color: pickColor(WIN_COLORS, i),
        })
      }
    }
    mood = { kind: 'win', startMs: nowMs }
  }

  // Lose: slow ash motes drifting up off the cards while the frame greys.
  const playLose = (spots: readonly BoardFxSpot[]): void => {
    if (disposed) return
    const nowMs = performance.now()
    for (const spot of spots) {
      for (let i = 0; i < LOSE_ASH_PER_SPOT; i += 1) {
        const angle = random() * Math.PI * 2
        const lateral = LOSE_ASH_LATERAL_SPEED * random()
        emit(nowMs, {
          x: spot.x + (random() - 0.5) * 0.3,
          y: spot.y + (random() - 0.5) * 0.3,
          z: spot.z,
          velX: Math.cos(angle) * lateral,
          velY: Math.sin(angle) * lateral,
          velZ: LOSE_ASH_UP_SPEED * (0.5 + random() * 0.9),
          gravityScale: LOSE_ASH_GRAVITY_SCALE,
          lifeMs: LOSE_ASH_LIFE_MS * (0.8 + random() * 0.5),
          size: LOSE_ASH_SIZE * (0.7 + random() * 0.7),
          color: pickColor(LOSE_COLORS, i),
        })
      }
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
    let anyActive = false
    // All particles share the group parent — one camera-facing basis per
    // update instead of per particle.
    let cardFacing: CardFacing | undefined
    for (const particle of particles) {
      if (!particle.active) continue
      const t = (nowMs - particle.startMs) / particle.lifeMs
      if (t >= 1) {
        particle.active = false
        particle.mesh.visible = false
        continue
      }
      anyActive = true
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
      particle.mesh.material.opacity =
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
    }
    return anyActive
  }

  const update = (nowMs: number): boolean => {
    if (disposed) return false
    const moodActive = updateMood(nowMs)
    const particlesActive = updateParticles(nowMs)
    return moodActive || particlesActive
  }

  const clear = (): void => {
    for (const particle of particles) {
      particle.active = false
      particle.mesh.visible = false
    }
    neutralMood()
  }

  const dispose = (): void => {
    if (disposed) return
    disposed = true
    mood = null
    for (const particle of particles) {
      group.remove(particle.mesh)
      particle.mesh.material.dispose()
      particle.active = false
    }
    particles.length = 0
    geometry.dispose()
    parent.remove(group)
  }

  return {
    spawnPuff,
    despawnPoof,
    playWin,
    playLose,
    neutralMood,
    update,
    clear,
    dispose,
  }
}

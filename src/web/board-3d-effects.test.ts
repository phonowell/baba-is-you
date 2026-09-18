import assert from 'node:assert/strict'
import test from 'node:test'

import { Group, PerspectiveCamera } from 'three'

import { BOARD3D_EFFECTS_CONFIG } from './board-3d-config-effects.js'
import { createBoard3dEffects } from './board-3d-effects.js'
import { BOARD_FX_MOOD_NEUTRAL } from './board-3d-shared-types.js'

import type { BoardFxMood } from './board-3d-shared-types.js'

const {
  SPAWN_PUFF_COUNT,
  SPAWN_PUFF_LIFE_MS,
  DESPAWN_POOF_COUNT,
  DESPAWN_POOF_LIFE_MS,
  WIN_MOOD_DECAY_MS,
  WIN_BLOOM_HOLD,
  WIN_SATURATION_HOLD,
  LOSE_MOOD_FADE_MS,
  LOSE_SATURATION,
  LOSE_VIGNETTE_ADD,
  LOSE_ASH_PER_SPOT,
  PARTICLE_MAX,
} = BOARD3D_EFFECTS_CONFIG

const createFx = (random?: () => number) => {
  const moods: BoardFxMood[] = []
  const parent = new Group()
  const camera = new PerspectiveCamera(50, 1, 0.1, 100)
  camera.position.set(0, 8, 6)
  camera.lookAt(0, 0, 0)
  camera.updateMatrixWorld(true)
  const fx = createBoard3dEffects({
    parent,
    camera,
    setMood: (mood) => {
      moods.push({ ...mood })
    },
    ...(random ? { random } : {}),
  })
  const fxGroup = parent.children[0]
  if (!fxGroup) throw new Error('Effects group missing.')
  return { fx, moods, parent, fxGroup }
}

test('board-3d effects spawn puff emits particles that live out their lifetime', () => {
  const { fx, fxGroup } = createFx(() => 0.5)
  const t0 = performance.now()

  fx.spawnPuff(1, 2, 0.1, ['#ff0000', '#00ff00'])
  assert.equal(fxGroup.children.length > 0, true)
  const live = fxGroup.children.filter((child) => child.visible)
  assert.equal(live.length, SPAWN_PUFF_COUNT)

  assert.equal(fx.update(t0 + SPAWN_PUFF_LIFE_MS * 0.5), true)
  assert.equal(fx.update(t0 + SPAWN_PUFF_LIFE_MS * 1.5 + 100), false)
  assert.equal(fxGroup.children.every((child) => !child.visible), true)
})

test('board-3d effects particles move and shrink over their life', () => {
  const { fx, fxGroup } = createFx(() => 0.5)
  const t0 = performance.now()

  fx.despawnPoof(0, 0, 0.1, ['#ff0000'])
  const particle = fxGroup.children[0]
  assert.ok(particle)
  const startX = particle.position.x
  const startZ = particle.position.z

  fx.update(t0 + DESPAWN_POOF_LIFE_MS * 0.4)
  assert.notEqual(particle.position.x, startX)
  assert.notEqual(particle.position.z, startZ)
})

test('board-3d effects pool recycles particles and caps at the max', () => {
  const { fx, fxGroup } = createFx(() => 0.5)
  const bursts = Math.ceil(PARTICLE_MAX / DESPAWN_POOF_COUNT) + 4
  for (let i = 0; i < bursts; i += 1) {
    fx.despawnPoof(0, 0, 0.1, ['#ff0000'])
  }
  assert.equal(fxGroup.children.length <= PARTICLE_MAX, true)
})

test('board-3d effects win pulses bloom and saturation then holds a warm glow', () => {
  const { fx, moods } = createFx(() => 0.5)
  const t0 = performance.now()

  fx.playWin([{ x: 0, y: 0, z: 0.1 }])
  assert.equal(moods.length, 0)

  fx.update(t0 + WIN_MOOD_DECAY_MS * 0.1)
  const early = moods.at(-1)
  assert.ok(early)
  assert.ok(early.bloomBoost > 0.5)
  assert.ok(early.saturationAdd > WIN_SATURATION_HOLD)

  fx.update(t0 + WIN_MOOD_DECAY_MS + 50)
  const settled = moods.at(-1)
  assert.ok(settled)
  assert.ok(Math.abs(settled.bloomBoost - WIN_BLOOM_HOLD) < 0.05)
  assert.ok(Math.abs(settled.saturationAdd - WIN_SATURATION_HOLD) < 0.05)
})

test('board-3d effects lose desaturates and darkens the frame', () => {
  const { fx, moods, fxGroup } = createFx(() => 0.5)
  const t0 = performance.now()

  fx.playLose([
    { x: -1, y: 0, z: 0.1 },
    { x: 1, y: 0, z: 0.1 },
  ])
  assert.equal(fxGroup.children.length, LOSE_ASH_PER_SPOT * 2)

  fx.update(t0 + LOSE_MOOD_FADE_MS + 50)
  const settled = moods.at(-1)
  assert.ok(settled)
  assert.ok(Math.abs(settled.saturationAdd - LOSE_SATURATION) < 0.05)
  assert.ok(Math.abs(settled.vignetteAdd - LOSE_VIGNETTE_ADD) < 0.05)
})

test('board-3d effects neutral mood restores the baseline once', () => {
  const { fx, moods } = createFx(() => 0.5)
  fx.playLose([{ x: 0, y: 0, z: 0.1 }])
  fx.neutralMood()

  const last = moods.at(-1)
  assert.deepEqual(last, BOARD_FX_MOOD_NEUTRAL)
  // Ash is still alive — mood writes stop but particles keep animating.
  assert.equal(fx.update(performance.now() + 16), true)
})

test('board-3d effects clear kills particles and resets mood', () => {
  const { fx, fxGroup, moods } = createFx(() => 0.5)
  fx.playWin([{ x: 0, y: 0, z: 0.1 }])
  fx.clear()

  assert.equal(fxGroup.children.every((child) => !child.visible), true)
  assert.equal(fx.update(performance.now() + 16), false)
  assert.deepEqual(moods.at(-1), BOARD_FX_MOOD_NEUTRAL)
})

test('board-3d effects dispose releases meshes and detaches the group', () => {
  const { fx, parent, fxGroup } = createFx(() => 0.5)
  fx.despawnPoof(0, 0, 0.1, ['#ff0000'])
  assert.equal(fxGroup.children.length > 0, true)

  fx.dispose()
  assert.equal(parent.children.length, 0)
  assert.equal(fx.update(performance.now() + 16), false)
  // Post-dispose calls are inert.
  fx.despawnPoof(0, 0, 0.1, ['#ff0000'])
  assert.equal(parent.children.length, 0)
})

import assert from 'node:assert/strict'
import test from 'node:test'

import { PerspectiveCamera } from 'three'

import { BOARD3D_PARALLAX_CONFIG } from './board-3d-config-camera.js'
import { createCameraParallax } from './board-3d-parallax.js'

const { PARALLAX_MAX_OFFSET_X, PARALLAX_MAX_OFFSET_Y } = BOARD3D_PARALLAX_CONFIG

const createCamera = (): PerspectiveCamera => {
  const camera = new PerspectiveCamera()
  camera.position.set(0, 12, 6)
  camera.lookAt(0, 0, 0)
  return camera
}

const runUntilSettled = (
  parallax: ReturnType<typeof createCameraParallax>,
  camera: PerspectiveCamera,
  startMs = 0,
): number => {
  let now = startMs
  for (let i = 0; i < 600; i += 1) {
    now += 16
    if (!parallax.update(now, camera)) return now
  }
  return now
}

test('camera parallax eases toward the target and then reports settled', () => {
  const camera = createCamera()
  const parallax = createCameraParallax()
  parallax.captureBase(camera)
  const baseX = camera.position.x

  parallax.setTarget(1, 0)
  const first = parallax.update(16, camera)
  assert.equal(first, true)
  assert.ok(camera.position.x > baseX)
  assert.ok(camera.position.x < baseX + PARALLAX_MAX_OFFSET_X)

  const settledAt = runUntilSettled(parallax, camera, 16)
  assert.ok(settledAt < 16 + 1000)
  assert.ok(Math.abs(camera.position.x - (baseX + PARALLAX_MAX_OFFSET_X)) < 1e-9)
})

test('camera parallax only translates — the camera quaternion is untouched', () => {
  const camera = createCamera()
  const parallax = createCameraParallax()
  parallax.captureBase(camera)
  const baseQuaternion = camera.quaternion.clone()

  parallax.setTarget(1, 1)
  runUntilSettled(parallax, camera)

  assert.ok(camera.quaternion.equals(baseQuaternion))
})

test('camera parallax downward target moves along camera-local down', () => {
  const camera = createCamera()
  const parallax = createCameraParallax()
  parallax.captureBase(camera)
  const base = camera.position.clone()

  parallax.setTarget(0, 1)
  runUntilSettled(parallax, camera)

  // Camera-local down tilts the offset into the Y/Z plane.
  const expectedUp = camera.position.clone().sub(base)
  assert.ok(Math.abs(expectedUp.length() - PARALLAX_MAX_OFFSET_Y) < 1e-9)
})

test('camera parallax is inert before a base is captured and once settled', () => {
  const camera = createCamera()
  const parallax = createCameraParallax()
  assert.equal(parallax.update(16, camera), false)

  // A rebase re-asserts the pose once, then the offset rests.
  parallax.captureBase(camera)
  assert.equal(parallax.update(32, camera), true)
  assert.equal(parallax.update(48, camera), false)
})

test('camera parallax re-applies its offset after a rebase', () => {
  const camera = createCamera()
  const parallax = createCameraParallax()
  parallax.captureBase(camera)

  parallax.setTarget(1, 0)
  runUntilSettled(parallax, camera)
  const offsetX = camera.position.x

  // updateCamera-style reset: position rewritten to a fresh base.
  camera.position.set(0, 12, 6)
  parallax.captureBase(camera)
  assert.equal(parallax.update(16, camera), true)
  assert.ok(Math.abs(camera.position.x - offsetX) < 1e-9)
})

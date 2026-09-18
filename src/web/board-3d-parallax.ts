import { Vector3 } from 'three'

import { BOARD3D_PARALLAX_CONFIG } from './board-3d-config-camera.js'

import type { Camera } from 'three'

const {
  PARALLAX_MAX_OFFSET_X,
  PARALLAX_MAX_OFFSET_Y,
  PARALLAX_TAU_MS,
  PARALLAX_EPSILON,
} = BOARD3D_PARALLAX_CONFIG

// Pointer parallax translates the camera only — its quaternion stays put,
// so billboard cards (which orient on camera direction, not position) need
// no re-posing while the viewpoint slides. That keeps the effect cheap:
// a few eased frames, then the RAF loop sleeps again.
export type CameraParallax = {
  setTarget: (nx: number, ny: number) => void
  // Re-baseline after updateCamera rewrote the camera pose; the captured
  // position is offset-free by definition at that point.
  captureBase: (camera: Camera) => void
  // Returns true while this call moved the camera — the runtime renders
  // the frame and schedules one more; false once the offset has settled.
  update: (nowMs: number, camera: Camera) => boolean
}

const clampUnit = (value: number): number =>
  Math.min(1, Math.max(-1, value))

export const createCameraParallax = (): CameraParallax => {
  const basePosition = new Vector3()
  const rightAxis = new Vector3(1, 0, 0)
  const upAxis = new Vector3(0, 1, 0)
  let hasBase = false
  let targetX = 0
  let targetY = 0
  let currentX = 0
  let currentY = 0
  let lastMs: number | null = null
  // A rebase resets the camera to its true base while `current*` still
  // holds the eased offset — the next update must rewrite it.
  let dirty = false

  const setTarget = (nx: number, ny: number): void => {
    targetX = clampUnit(nx)
    targetY = clampUnit(ny)
  }

  const captureBase = (camera: Camera): void => {
    basePosition.copy(camera.position)
    rightAxis.set(1, 0, 0).applyQuaternion(camera.quaternion)
    upAxis.set(0, 1, 0).applyQuaternion(camera.quaternion)
    hasBase = true
    dirty = true
  }

  const update = (nowMs: number, camera: Camera): boolean => {
    if (!hasBase) return false
    const dt =
      lastMs === null ? 16.7 : Math.min(Math.max(nowMs - lastMs, 0), 100)
    lastMs = nowMs
    const step = 1 - Math.exp(-dt / PARALLAX_TAU_MS)

    const prevX = currentX
    const prevY = currentY
    currentX += (targetX - currentX) * step
    currentY += (targetY - currentY) * step
    if (Math.abs(targetX - currentX) < PARALLAX_EPSILON) currentX = targetX
    if (Math.abs(targetY - currentY) < PARALLAX_EPSILON) currentY = targetY

    const moved = dirty || currentX !== prevX || currentY !== prevY
    dirty = false
    if (!moved) return false

    // +nx peeks right; +ny (pointer below center) peeks down-screen,
    // which is the camera's local -up direction.
    camera.position
      .copy(basePosition)
      .addScaledVector(rightAxis, currentX * PARALLAX_MAX_OFFSET_X)
      .addScaledVector(upAxis, -currentY * PARALLAX_MAX_OFFSET_Y)
    return true
  }

  return {
    setTarget,
    captureBase,
    update,
  }
}

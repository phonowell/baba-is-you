import { Shape, Vector3 } from 'three'

import { BOARD3D_LAYOUT_CONFIG } from './board-3d-config.js'

const {
  PLAY_AREA_OUTLINE_RADIUS,
  PLAY_AREA_OUTLINE_SAMPLES_MIN,
  PLAY_AREA_OUTLINE_SAMPLES_DENSITY,
  PLAY_AREA_RADIUS_CLAMP_RATIO,
} = BOARD3D_LAYOUT_CONFIG

export const buildRoundedRectShape = (halfWidth: number, halfHeight: number): Shape => {
  const left = -halfWidth
  const right = halfWidth
  const bottom = -halfHeight
  const top = halfHeight
  const radius = Math.min(
    PLAY_AREA_OUTLINE_RADIUS,
    halfWidth * PLAY_AREA_RADIUS_CLAMP_RATIO,
    halfHeight * PLAY_AREA_RADIUS_CLAMP_RATIO,
  )
  const shape = new Shape()
  if (radius <= 0) {
    shape.moveTo(left, bottom)
    shape.lineTo(right, bottom)
    shape.lineTo(right, top)
    shape.lineTo(left, top)
    shape.lineTo(left, bottom)
    shape.closePath()
    return shape
  }

  shape.moveTo(left + radius, bottom)
  shape.lineTo(right - radius, bottom)
  shape.absarc(right - radius, bottom + radius, radius, -Math.PI / 2, 0, false)
  shape.lineTo(right, top - radius)
  shape.absarc(right - radius, top - radius, radius, 0, Math.PI / 2, false)
  shape.lineTo(left + radius, top)
  shape.absarc(left + radius, top - radius, radius, Math.PI / 2, Math.PI, false)
  shape.lineTo(left, bottom + radius)
  shape.absarc(left + radius, bottom + radius, radius, Math.PI, (Math.PI * 3) / 2, false)
  shape.closePath()
  return shape
}

export const buildRoundedRectOutlinePoints = (
  halfWidth: number,
  halfHeight: number,
  z: number,
): Vector3[] => {
  const shape = buildRoundedRectShape(halfWidth, halfHeight)
  const curveSamples = Math.max(
    PLAY_AREA_OUTLINE_SAMPLES_MIN,
    Math.round((halfWidth + halfHeight) * PLAY_AREA_OUTLINE_SAMPLES_DENSITY),
  )
  const points = shape.getPoints(curveSamples).map((point) => new Vector3(point.x, point.y, z))
  const firstPoint = points.at(0)
  if (firstPoint) points.push(firstPoint.clone())
  return points
}

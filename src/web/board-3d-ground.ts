import {
  BufferGeometry,
  Color,
  DirectionalLight,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshStandardMaterial,
  OrthographicCamera,
  PlaneGeometry,
  ShapeGeometry,
} from 'three'

import { BOARD3D_LAYOUT_CONFIG } from './board-3d-config-layout.js'
import { BOARD3D_LIGHTING_CONFIG } from './board-3d-config-lighting.js'
import { BOARD3D_SHADOW_CONFIG } from './board-3d-config-shadow.js'
import { buildRoundedRectOutlinePoints, buildRoundedRectShape } from './board-3d-ground-shape.js'

const {
  GROUND_SURFACE_Z,
  GROUND_ACTIVE_FILL_Z,
  GROUND_EXPANDED_MIN_SIZE,
  PLAY_AREA_OUTLINE_Z,
  PLAY_AREA_OUTLINE_OPACITY,
  GROUND_EXPANDED_PADDING,
  GROUND_BASE_COLOR,
  GROUND_MATERIAL_ROUGHNESS,
  GROUND_MATERIAL_METALNESS,
  PLAY_AREA_FILL_COLOR,
  PLAY_AREA_FILL_ROUGHNESS,
  PLAY_AREA_FILL_METALNESS,
  PLAY_AREA_OUTLINE_COLOR,
} = BOARD3D_LAYOUT_CONFIG

const {
  LIGHT_SHADOW_CAMERA_NEAR,
  LIGHT_SHADOW_BIAS,
  LIGHT_SHADOW_NORMAL_BIAS,
} = BOARD3D_LIGHTING_CONFIG

const {
  SHADOW_RADIUS,
} = BOARD3D_SHADOW_CONFIG

export type GroundVisuals = {
  groundMesh: Mesh<PlaneGeometry, MeshStandardMaterial> | null
  playAreaFillMesh: Mesh<ShapeGeometry, MeshStandardMaterial> | null
  playAreaOutline: Line<BufferGeometry, LineBasicMaterial> | null
}

export const configureTopLight = (
  light: DirectionalLight,
  shadowMapEdge: number,
  shadowFar: number,
): void => {
  light.castShadow = true
  light.shadow.mapSize.width = shadowMapEdge
  light.shadow.mapSize.height = shadowMapEdge
  light.shadow.camera.near = LIGHT_SHADOW_CAMERA_NEAR
  light.shadow.camera.far = shadowFar
  light.shadow.bias = LIGHT_SHADOW_BIAS
  light.shadow.normalBias = LIGHT_SHADOW_NORMAL_BIAS
  light.shadow.radius = SHADOW_RADIUS
}

export const updateLightShadowCamera = (
  light: DirectionalLight,
  span: number,
  far: number,
): void => {
  const shadowCamera = light.shadow.camera as OrthographicCamera
  shadowCamera.left = -span
  shadowCamera.right = span
  shadowCamera.top = span
  shadowCamera.bottom = -span
  shadowCamera.far = far
  shadowCamera.updateProjectionMatrix()
  light.shadow.needsUpdate = true
}

export const disposeGroundVisuals = (
  world: Group,
  visuals: GroundVisuals,
): GroundVisuals => {
  const { groundMesh, playAreaFillMesh, playAreaOutline } = visuals
  if (playAreaFillMesh) {
    world.remove(playAreaFillMesh)
    playAreaFillMesh.geometry.dispose()
    playAreaFillMesh.material.dispose()
  }
  if (playAreaOutline) {
    world.remove(playAreaOutline)
    playAreaOutline.geometry.dispose()
    playAreaOutline.material.dispose()
  }
  if (groundMesh) {
    world.remove(groundMesh)
    groundMesh.geometry.dispose()
    groundMesh.material.dispose()
  }
  return {
    groundMesh: null,
    playAreaFillMesh: null,
    playAreaOutline: null,
  }
}

export const rebuildGroundVisuals = (
  world: Group,
  boardWidth: number,
  boardHeight: number,
  visuals: GroundVisuals,
): GroundVisuals => {
  disposeGroundVisuals(world, visuals)

  const expandedWidth = Math.max(
    boardWidth + GROUND_EXPANDED_PADDING,
    GROUND_EXPANDED_MIN_SIZE,
  )
  const expandedHeight = Math.max(
    boardHeight + GROUND_EXPANDED_PADDING,
    GROUND_EXPANDED_MIN_SIZE,
  )
  const geometry = new PlaneGeometry(expandedWidth, expandedHeight)
  const material = new MeshStandardMaterial({
    color: new Color(GROUND_BASE_COLOR),
    roughness: GROUND_MATERIAL_ROUGHNESS,
    metalness: GROUND_MATERIAL_METALNESS,
  })
  const groundMesh = new Mesh(geometry, material)
  groundMesh.position.z = GROUND_SURFACE_Z
  groundMesh.receiveShadow = true
  world.add(groundMesh)

  const halfWidth = boardWidth / 2
  const halfHeight = boardHeight / 2
  const playAreaShape = buildRoundedRectShape(halfWidth, halfHeight)
  const playAreaFillGeometry = new ShapeGeometry(playAreaShape)
  const playAreaFillMaterial = new MeshStandardMaterial({
    color: new Color(PLAY_AREA_FILL_COLOR),
    roughness: PLAY_AREA_FILL_ROUGHNESS,
    metalness: PLAY_AREA_FILL_METALNESS,
  })
  const playAreaFillMesh = new Mesh(playAreaFillGeometry, playAreaFillMaterial)
  playAreaFillMesh.position.z = GROUND_ACTIVE_FILL_Z
  playAreaFillMesh.receiveShadow = true
  world.add(playAreaFillMesh)

  const outlineGeometry = new BufferGeometry().setFromPoints(
    buildRoundedRectOutlinePoints(halfWidth, halfHeight, PLAY_AREA_OUTLINE_Z),
  )
  const outlineMaterial = new LineBasicMaterial({
    color: new Color(PLAY_AREA_OUTLINE_COLOR),
    transparent: true,
    opacity: PLAY_AREA_OUTLINE_OPACITY,
  })
  const playAreaOutline = new Line(outlineGeometry, outlineMaterial)
  world.add(playAreaOutline)

  return {
    groundMesh,
    playAreaFillMesh,
    playAreaOutline,
  }
}

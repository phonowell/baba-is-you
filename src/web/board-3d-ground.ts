import {
  BufferGeometry,
  Color,
  DirectionalLight,
  Group,
  Line,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshToonMaterial,
  OrthographicCamera,
  PlaneGeometry,
  ShapeGeometry,
} from 'three'

import { BOARD3D_LAYOUT_CONFIG } from './board-3d-config-layout.js'
import { BOARD3D_LIGHTING_CONFIG } from './board-3d-config-lighting.js'
import { BOARD3D_SHADOW_CONFIG } from './board-3d-config-shadow.js'
import {
  buildCellGridPoints,
  buildRoundedRectOutlinePoints,
  buildRoundedRectShape,
} from './board-3d-ground-shape.js'
import {
  createGroundMottleTexture,
  getToonGradientMap,
} from './board-3d-textures.js'

const {
  GROUND_SURFACE_Z,
  GROUND_ACTIVE_FILL_Z,
  GROUND_EXPANDED_MIN_SIZE,
  PLAY_AREA_OUTLINE_Z,
  PLAY_AREA_OUTLINE_OPACITY,
  CELL_GRID_Z,
  CELL_GRID_COLOR,
  CELL_GRID_OPACITY,
  GROUND_EXPANDED_PADDING,
  GROUND_BASE_COLOR,
  PLAY_AREA_FILL_COLOR,
  PLAY_AREA_OUTLINE_COLOR,
  GROUND_MOTTLE_TILE_WORLD,
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
  groundMesh: Mesh<PlaneGeometry, MeshToonMaterial> | null
  playAreaFillMesh: Mesh<ShapeGeometry, MeshToonMaterial> | null
  playAreaOutline: Line<BufferGeometry, LineBasicMaterial> | null
  cellGrid: LineSegments<BufferGeometry, LineBasicMaterial> | null
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
  const { groundMesh, playAreaFillMesh, playAreaOutline, cellGrid } = visuals
  if (cellGrid) {
    world.remove(cellGrid)
    cellGrid.geometry.dispose()
    cellGrid.material.dispose()
  }
  if (playAreaFillMesh) {
    world.remove(playAreaFillMesh)
    playAreaFillMesh.geometry.dispose()
    playAreaFillMesh.material.map?.dispose()
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
    groundMesh.material.map?.dispose()
    groundMesh.material.dispose()
  }
  return {
    groundMesh: null,
    playAreaFillMesh: null,
    playAreaOutline: null,
    cellGrid: null,
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
  // Painterly mottle multiplies the flat grass colour — the hand-painted
  // terrain look. Plane UVs span 0..1 across the whole plane, so repeat is
  // scaled to keep one tile per GROUND_MOTTLE_TILE_WORLD world units.
  const groundTexture = createGroundMottleTexture()
  groundTexture.repeat.set(
    expandedWidth / GROUND_MOTTLE_TILE_WORLD,
    expandedHeight / GROUND_MOTTLE_TILE_WORLD,
  )
  const material = new MeshToonMaterial({
    color: new Color(GROUND_BASE_COLOR),
    gradientMap: getToonGradientMap(),
    map: groundTexture,
  })
  const groundMesh = new Mesh(geometry, material)
  groundMesh.position.z = GROUND_SURFACE_Z
  groundMesh.receiveShadow = true
  world.add(groundMesh)

  const halfWidth = boardWidth / 2
  const halfHeight = boardHeight / 2
  const playAreaShape = buildRoundedRectShape(halfWidth, halfHeight)
  const playAreaFillGeometry = new ShapeGeometry(playAreaShape)
  // ShapeGeometry UVs are raw world-space xy — repeat inverts the tile size.
  const playAreaTexture = createGroundMottleTexture()
  playAreaTexture.repeat.set(
    1 / GROUND_MOTTLE_TILE_WORLD,
    1 / GROUND_MOTTLE_TILE_WORLD,
  )
  const playAreaFillMaterial = new MeshToonMaterial({
    color: new Color(PLAY_AREA_FILL_COLOR),
    gradientMap: getToonGradientMap(),
    map: playAreaTexture,
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

  const cellGridGeometry = new BufferGeometry().setFromPoints(
    buildCellGridPoints(boardWidth, boardHeight, CELL_GRID_Z),
  )
  const cellGridMaterial = new LineBasicMaterial({
    color: new Color(CELL_GRID_COLOR),
    transparent: true,
    opacity: CELL_GRID_OPACITY,
  })
  const cellGrid = new LineSegments(cellGridGeometry, cellGridMaterial)
  world.add(cellGrid)

  return {
    groundMesh,
    playAreaFillMesh,
    playAreaOutline,
    cellGrid,
  }
}

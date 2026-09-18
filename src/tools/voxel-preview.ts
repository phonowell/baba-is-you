import {
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshToonMaterial,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
  Color,
  PlaneGeometry,
  MeshBasicMaterial,
} from 'three'

import { BOARD3D_VOXEL_CONFIG } from '../web/board-3d-config-voxel.js'
import { BOARD3D_LAYOUT_CONFIG } from '../web/board-3d-config-layout.js'
import { getToonGradientMap } from '../web/board-3d-textures.js'
import { applyVolumeOrientation } from '../web/board-3d-card-facing.js'
import { spriteFrames, spriteVolumeBounds } from '../web/pixel-sprites/derive.js'
import { arrowMarkerSlices } from '../web/pixel-sprites/arrows.js'
import { PIXEL_SPRITES } from '../web/pixel-sprites/index.js'
import {
  buildVoxelVolumeGeometry,
  inflateVolume,
  spriteVolumes,
  voxelDrawRect,
} from '../web/pixel-sprites/voxel.js'

const {
  VOXEL_FRAME_Z,
  VOXEL_INNER_SIZE_RATIO,
  VOXEL_INFLATE_MAX_LAYERS,
  VOXEL_INFLATE_MIN_LAYERS,
  VOXEL_OUTLINE_COLOR,
  VOXEL_SHADE_FRONT,
  VOXEL_SHADE_TOP,
  VOXEL_SHADE_SIDE,
  VOXEL_SHADE_BOTTOM,
  VOXEL_SHADE_BACK,
} = BOARD3D_VOXEL_CONFIG

const { CARD_BASE_Z, GROUND_SURFACE_Z } = BOARD3D_LAYOUT_CONFIG

const SHADE = {
  front: VOXEL_SHADE_FRONT,
  top: VOXEL_SHADE_TOP,
  side: VOXEL_SHADE_SIDE,
  bottom: VOXEL_SHADE_BOTTOM,
  back: VOXEL_SHADE_BACK,
}

const INNER_SIZE = 0.88 * VOXEL_INNER_SIZE_RATIO

// Mirrors voxelVisual's rotating branch: feet planted on the ground plane,
// depth centered, floor-arrow marker in front, mesh stood upright + yawed.
const buildStandingMesh = (name: string, material: MeshToonMaterial): Mesh => {
  const sprite = PIXEL_SPRITES[name]
  if (!sprite) throw new Error(`missing sprite ${name}`)
  const volumes = spriteVolumes(sprite, (frame) =>
    inflateVolume(frame, VOXEL_INFLATE_MAX_LAYERS, VOXEL_INFLATE_MIN_LAYERS),
  )
  const bounds = spriteVolumeBounds(sprite, volumes)
  if (!bounds) throw new Error(`empty sprite ${name}`)
  const rect = voxelDrawRect(bounds, INNER_SIZE)
  const frame = spriteFrames(sprite)[0]
  if (!frame) throw new Error(`no frame for ${name}`)
  const volume0 = volumes[0]
  const drawY = (bounds.maxY + 1) * rect.texel - (CARD_BASE_Z - GROUND_SURFACE_Z)
  const frameFrontZ = volume0
    ? (((volume0.backSlices?.length ?? 0) + 1) -
        (volume0.frontSlices?.length ?? 0)) *
      (rect.texel / 2)
    : VOXEL_FRAME_Z
  const overlays = arrowMarkerSlices(bounds)
  const geometry = buildVoxelVolumeGeometry(
    { frame, palette: sprite.palette, volume: volume0, overlays },
    {
      drawX: rect.drawX,
      drawY,
      texel: rect.texel,
      frameFrontZ,
      shade: SHADE,
      outlineColor: VOXEL_OUTLINE_COLOR,
    },
  )
  return new Mesh(geometry, material)
}

const scene = new Scene()
scene.background = new Color('#7cc35f')

const camera = new PerspectiveCamera(24, 2, 0.1, 100)
camera.position.set(0, 7, 9)
camera.lookAt(0, 0.2, 0)

const renderer = new WebGLRenderer({ antialias: true })
renderer.setSize(1200, 600)
renderer.setPixelRatio(2)
document.body.appendChild(renderer.domElement)

scene.add(new HemisphereLight('#bcd8ff', '#7da860', 0.9))
const sun = new DirectionalLight('#ffedc8', 1.3)
sun.position.set(2, 3, 4)
scene.add(sun)

// Ground plane at the same height the game uses.
const ground = new Mesh(
  new PlaneGeometry(30, 30),
  new MeshBasicMaterial({ color: '#5da84f' }),
)
ground.rotation.x = -Math.PI / 2
ground.position.y = GROUND_SURFACE_Z
scene.add(ground)

const material = new MeshToonMaterial({
  vertexColors: true,
  gradientMap: getToonGradientMap(),
})

// One upright model per facing: down/right/up/left — the four yaw states the
// game produces. Each stands on the floor plate; the white arrow marker
// should sit in front of the feet, pointing where the model faces.
const FACING_YAWS = [
  ['down', 0],
  ['right', Math.PI / 2],
  ['up', Math.PI],
  ['left', -Math.PI / 2],
] as const

// Same parent transform the game uses: the entity group lives inside a
// world group pitched -90deg around X, so group +Z is true world up.
const world = new Group()
world.rotation.x = -Math.PI / 2
scene.add(world)
const entityGroup = new Group()
world.add(entityGroup)

const xs = [-1.65, -0.55, 0.55, 1.65]
for (const [rowIx, name] of ['baba', 'keke', 'me'].entries()) {
  for (let ix = 0; ix < FACING_YAWS.length; ix++) {
    const mesh = buildStandingMesh(name, material)
    mesh.position.set(xs[ix]!, 1.4 - rowIx * 1.4, CARD_BASE_Z)
    applyVolumeOrientation(mesh, 0, FACING_YAWS[ix]![1])
    entityGroup.add(mesh)
  }
}

renderer.render(scene, camera)

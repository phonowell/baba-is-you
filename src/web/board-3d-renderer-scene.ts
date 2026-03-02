import {
  AmbientLight,
  Color,
  DirectionalLight,
  Group,
  PCFSoftShadowMap,
  PerspectiveCamera,
  SRGBColorSpace,
  Scene,
  Vector2,
  WebGLRenderer,
} from 'three'
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'

import { selectClayCameraTier } from './clay-config.js'
import {
  BOARD3D_CAMERA_CONFIG,
  BOARD3D_LIGHTING_CONFIG,
  BOARD3D_POSTFX_CONFIG,
  BOARD3D_SHADOW_CONFIG,
} from './board-3d-config.js'
import { configureTopLight } from './board-3d-ground.js'

type ClayPreset = typeof import('./clay-config.js').CLAY_PRESET

const {
  CAMERA_NEAR,
  CAMERA_FAR,
  WORLD_ROTATION_X,
} = BOARD3D_CAMERA_CONFIG

const {
  AMBIENT_LIGHT_COLOR,
  AMBIENT_LIGHT_INTENSITY_MUL,
  SIDE_LIGHT_INTENSITY_MIN,
  SIDE_LIGHT_INTENSITY_MUL,
  SIDE_LIGHT_INITIAL_Y,
  SIDE_LIGHT_INITIAL_Z,
} = BOARD3D_LIGHTING_CONFIG

const {
  SHADOW_MAP_SIZE_SCALE,
} = BOARD3D_SHADOW_CONFIG

const {
  BLOOM_INITIAL_RESOLUTION_X,
  BLOOM_INITIAL_RESOLUTION_Y,
  BOKEH_INITIAL_FOCUS,
} = BOARD3D_POSTFX_CONFIG

export type Board3dRendererScene = {
  camera: PerspectiveCamera
  renderer: WebGLRenderer
  composer: EffectComposer
  bloomPass: UnrealBloomPass
  bokehPass: BokehPass
  leftLight: DirectionalLight
  rightLight: DirectionalLight
  world: Group
  entityGroup: Group
}

export const createBoard3dRendererScene = (
  preset: ClayPreset,
): Board3dRendererScene => {
  const initialCameraTier = selectClayCameraTier(1, 1)
  const scene = new Scene()
  scene.background = new Color(preset.sceneBackground)

  const camera = new PerspectiveCamera(
    initialCameraTier.fov,
    1,
    CAMERA_NEAR,
    CAMERA_FAR,
  )

  const renderer = new WebGLRenderer({
    antialias: false,
    alpha: false,
    powerPreference: 'high-performance',
  })
  renderer.outputColorSpace = SRGBColorSpace
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = PCFSoftShadowMap
  renderer.domElement.className = 'board-3d-canvas'
  renderer.domElement.setAttribute('aria-hidden', 'true')

  const composer = new EffectComposer(renderer)
  composer.addPass(new RenderPass(scene, camera))

  const bloomPass = new UnrealBloomPass(
    new Vector2(
      BLOOM_INITIAL_RESOLUTION_X,
      BLOOM_INITIAL_RESOLUTION_Y,
    ),
    preset.bloom.strength,
    preset.bloom.radius,
    preset.bloom.threshold,
  )
  composer.addPass(bloomPass)

  const bokehPass = new BokehPass(scene, camera, {
    focus: BOKEH_INITIAL_FOCUS,
    aperture: preset.bokeh.aperture,
    maxblur: preset.bokeh.maxBlur,
  })
  composer.addPass(bokehPass)

  const ambientLight = new AmbientLight(
    AMBIENT_LIGHT_COLOR,
    preset.lighting.ambientIntensity * AMBIENT_LIGHT_INTENSITY_MUL,
  )
  scene.add(ambientLight)

  const sideLightIntensity = Math.max(
    SIDE_LIGHT_INTENSITY_MIN,
    preset.lighting.topLightIntensity * SIDE_LIGHT_INTENSITY_MUL,
  )
  const shadowMapSize = Math.max(
    preset.lighting.topLightShadowMapSize,
    Math.round(preset.lighting.topLightShadowMapSize * SHADOW_MAP_SIZE_SCALE),
  )

  const leftLight = new DirectionalLight(
    preset.lighting.topLightColor,
    sideLightIntensity,
  )
  leftLight.position.set(0, SIDE_LIGHT_INITIAL_Y, SIDE_LIGHT_INITIAL_Z)
  configureTopLight(leftLight, shadowMapSize, preset.lighting.topLightShadowFar)
  scene.add(leftLight)
  scene.add(leftLight.target)

  const rightLight = new DirectionalLight(preset.lighting.topLightColor, sideLightIntensity)
  configureTopLight(rightLight, shadowMapSize, preset.lighting.topLightShadowFar)
  scene.add(rightLight)
  scene.add(rightLight.target)

  const world = new Group()
  world.rotation.x = WORLD_ROTATION_X
  scene.add(world)

  const entityGroup = new Group()
  world.add(entityGroup)

  return {
    camera,
    renderer,
    composer,
    bloomPass,
    bokehPass,
    leftLight,
    rightLight,
    world,
    entityGroup,
  }
}

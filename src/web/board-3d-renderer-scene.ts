import {
  CanvasTexture,
  DirectionalLight,
  FogExp2,
  Group,
  HalfFloatType,
  HemisphereLight,
  NoToneMapping,
  PCFSoftShadowMap,
  PerspectiveCamera,
  SRGBColorSpace,
  Scene,
  WebGLRenderer,
} from 'three'
import {
  BloomEffect,
  BrightnessContrastEffect,
  EffectComposer,
  EffectPass,
  HueSaturationEffect,
  RenderPass,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
} from 'postprocessing'
import { N8AOPostPass } from 'n8ao'

import { selectClayCameraTier } from './clay-config.js'
import {
  BOARD3D_CAMERA_CONFIG,
} from './board-3d-config-camera.js'
import {
  BOARD3D_LIGHTING_CONFIG,
} from './board-3d-config-lighting.js'
import {
  BOARD3D_SHADOW_CONFIG,
} from './board-3d-config-shadow.js'
import { configureTopLight } from './board-3d-ground.js'
import { createSkyGradientTexture } from './board-3d-textures.js'

type ClayPreset = typeof import('./clay-config.js').CLAY_PRESET

const {
  CAMERA_NEAR,
  CAMERA_FAR,
  WORLD_ROTATION_X,
} = BOARD3D_CAMERA_CONFIG

const {
  AMBIENT_LIGHT_COLOR,
  HEMISPHERE_GROUND_COLOR,
  AMBIENT_LIGHT_INTENSITY_MUL,
  SIDE_LIGHT_INTENSITY_MIN,
  SIDE_LIGHT_INTENSITY_MUL,
  FILL_LIGHT_COLOR,
  FILL_LIGHT_INTENSITY_MUL,
  SIDE_LIGHT_INITIAL_Y,
  SIDE_LIGHT_INITIAL_Z,
} = BOARD3D_LIGHTING_CONFIG

const {
  SHADOW_MAP_SIZE_SCALE,
} = BOARD3D_SHADOW_CONFIG

export type Board3dRendererScene = {
  camera: PerspectiveCamera
  renderer: WebGLRenderer
  composer: EffectComposer
  bloomEffect: BloomEffect
  leftLight: DirectionalLight
  rightLight: DirectionalLight
  world: Group
  entityGroup: Group
  skyTexture: CanvasTexture
}

export const createBoard3dRendererScene = (
  preset: ClayPreset,
): Board3dRendererScene => {
  const initialCameraTier = selectClayCameraTier(1, 1)
  const scene = new Scene()
  // Genshin-style backdrop: vertical sky gradient behind the board, fog
  // tinted to the horizon so the ground edge dissolves into the haze.
  const skyTexture = createSkyGradientTexture(preset.sky.top, preset.sky.horizon)
  scene.background = skyTexture
  scene.fog = new FogExp2(preset.sceneBackground, preset.fog.density)

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
  // Tone mapping runs as a ToneMappingEffect at the end of the chain, so the
  // renderer itself must not bake it into the scene render.
  renderer.toneMapping = NoToneMapping
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = PCFSoftShadowMap
  renderer.domElement.className = 'board-3d-canvas'
  renderer.domElement.setAttribute('aria-hidden', 'true')

  // pmndrs composer: MSAA on the HDR buffers, and every pass that declares
  // needsDepthTexture shares a single resolved depth copy per frame.
  const composer = new EffectComposer(renderer, {
    frameBufferType: HalfFloatType,
    multisampling: 4,
  })
  composer.addPass(new RenderPass(scene, camera))

  // Depth-based AO: samples the shared depth texture and reconstructs
  // normals from it, so unlike GTAO there is no scene re-render and no
  // alpha-test halo. halfRes quarters the AO pixel cost.
  const aoPass = new N8AOPostPass(scene, camera)
  aoPass.configuration.halfRes = preset.ao.halfRes
  aoPass.configuration.aoSamples = preset.ao.samples
  aoPass.configuration.aoRadius = preset.ao.radius
  aoPass.configuration.intensity = preset.ao.intensity
  aoPass.configuration.distanceFalloff = preset.ao.distanceFalloff
  composer.addPass(aoPass)

  const bloomEffect = new BloomEffect({
    intensity: preset.bloom.strength,
    luminanceThreshold: preset.bloom.threshold,
    luminanceSmoothing: 0.2,
    mipmapBlur: true,
    radius: preset.bloom.radius,
  })
  composer.addPass(new EffectPass(camera, bloomEffect))

  composer.addPass(
    new EffectPass(
      camera,
      new BrightnessContrastEffect({ contrast: preset.grade.contrast - 1 }),
      new HueSaturationEffect({ saturation: preset.grade.saturation - 1 }),
      new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC }),
      new VignetteEffect({
        offset: preset.grade.vignetteOffset,
        darkness: preset.grade.vignetteStrength,
      }),
    ),
  )

  // Hemisphere light: sky-blue fill from above, green ground bounce from
  // below — toon materials pick up the two-tone ambient like anime cel.
  const ambientLight = new HemisphereLight(
    AMBIENT_LIGHT_COLOR,
    HEMISPHERE_GROUND_COLOR,
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

  // Cool fill opposite the warm key: blue-tints shaded faces instead of
  // washing them out with a second warm light. No shadow casting — one
  // shadowed key keeps shadows readable (and halves shadow-map cost).
  const rightLight = new DirectionalLight(
    FILL_LIGHT_COLOR,
    preset.lighting.topLightIntensity * FILL_LIGHT_INTENSITY_MUL,
  )
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
    bloomEffect,
    leftLight,
    rightLight,
    world,
    entityGroup,
    skyTexture,
  }
}

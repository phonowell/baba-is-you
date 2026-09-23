# 3D Renderer

## Scope

`src/web/board-3d-*.ts` + `src/web/pixel-sprites/` — the only scene path;
there is no 2D/no-WebGL fallback. One fixed clay-look preset
(`clay-config.ts`, `CLAY_PRESET`), no runtime style switch.

## Composition

`app.ts` lazily builds the renderer on first game draw — the whole Three.js
stack sits behind a pack boundary (`board-3d-lazy.ts` → `import()`), so the
menu never downloads it:

```text
createBoard3dRendererFactoryDeps()   board-3d-renderer-factory.ts
  ├─ createBoard3dRendererScene(preset)      renderer + composer + lights + camera + sky
  ├─ createBoard3dRendererMaterialStore()    item → EntityVisual (cached)
  ├─ createBoard3dRendererViewController()   viewport/camera/readability/fx-mood
  ├─ createBoard3dEffects()                  particle layer (optional seam)
  ├─ createBoardHoverVisual() + pickBoardCell hover marker + raycast seam
  └─ createEntityNode / disposeBoard3dRendererResources / shadow assets
        │
        ▼
createBoard3dRendererRuntime(deps)   board-3d-renderer-runtime.ts
  mount(container) · sync(state) · unmount() · dispose()
  setHoverAtPoint(x,y,rect) · clearHover()
```

The factory owns every long-lived resource (renderer, composer, geometry
and texture caches); the runtime owns the per-board lifecycle. Tests inject
stubs through the runtime's optional args (`requestFrame`/`cancelFrame`,
`scheduleTimer`, `effects`, `hover`, `pickCell`, `syncNodes`,
`applyNodePoseStep`, `rebuildGround`, `advanceSpriteFrames`) — runtime and
resource lifecycle are the seams to verify, not just the pure helpers.

## Scene & Camera

`board-3d-renderer-scene.ts`: `WebGLRenderer` (sRGB, PCF soft shadows) →
`EffectComposer` with `RenderPass`, `N8AOPostPass` (half-res AO), `Bloom`,
`HueSaturation`, `BrightnessContrast`, `ToneMapping`, `Vignette` — from
`three` + `postprocessing` + `n8ao`. Lighting rig: hemisphere ambient +
key/fill/side directionals (`board-3d-renderer-lighting.ts`), exponential
fog, sky gradient texture. `board-3d-renderer-camera.ts` fits a tiered
perspective camera (`selectClayCameraTier` — tight/standard/wide by board
span) with pitch/distance/look-at bias from `board-3d-config-camera.ts`.

`board-3d-renderer-view.ts` (`viewController`) per sync:

- `updateViewport`/`updateCamera` — resize + retier on board change
- `applyReadabilityGuard` — the preset's `readabilityMix` scales bloom and
  grade down as text-card density rises (rules must stay legible)
- `setFxMood` — additive postfx offsets while a win/lose pulse runs

## Entity Visuals

`board-3d-renderer-materials.ts` maps an `Item` to a cached `EntityVisual`
(`getVisual(item, overridden, tileMask)`):

- **Voxel models** — items with a pixel sprite extrude to a voxel volume
  (`pixel-sprites/voxel.ts`): sprite layers at their own depth plus
  hand-authored front/back slices, per-face shading from
  `BOARD3D_VOXEL_CONFIG`.
- **Card plates** — text/emoji/glyph labels render as rounded plates with a
  painted `CanvasTexture` (`board-3d-textures.ts`), toon-shaded.
- **Facing arrows** — `pixel-sprites/arrows.ts` supplies a raised voxel
  overlay on directional units.
- **Veto mark** — `pixel-sprites/cross.ts` paints a pixel X over cards in
  `overriddenTextIds`.
- **Autotile** — `board-3d-autotile.ts` + `pixel-sprites/autotile.ts`:
  8-neighbour masks (4 edges + 4 diagonal pinch bits) pick shore/path
  sprite variants for terrain (`water`, `line`, …).
- **Shadows** — every upright node gets a blob-shadow quad
  (`createShadowTexture`); ground-hug items lie flat instead.

Stack order and ground-hug classification are *not* reimplemented here —
they come from `src/view/stack-policy.ts` (`cursor > you > text >
move/fall > push/pull > open/shut > else`; `tile`/`water`/`lava`/`belt`/
`line`/`tile_*` hug the ground) via `board-3d-shared-layout.ts`, which also
maps cell → world position and computes per-node base targets.

## Node Lifecycle

`board-3d-node-sync.ts` diffs `GameState.items` against the live
`Map<id, EntityNode>`: new ids create nodes (`board-3d-node-create.ts` —
mesh + shadow + optional spawn-stagger delay), moved/renamed ones update
targets and materials, vanished ones play a despawn then are removed.
`board-3d-node-pose.ts` advances per-node animation (move lerp, yaw on
direction change, spawn ease, idle bob/stretch) — `nodeYawAtMs`/
`nodeRollAtMs` keep a node on its animation curve until it settles.
`board-3d-card-facing.ts` tilts card faces toward the camera
(`CARD_FACE_CAMERA_BLEND`).

## Ground

`board-3d-ground.ts` builds the board base (rounded-rect play area via
`board-3d-ground-shape.ts`, toon ground fill, dashed cell grid,
active-fill overlay) and fits the key light's shadow camera to the board
span. Rebuilt per level through the runtime's `rebuildGround` seam.

## Effects

`board-3d-effects.ts` is a self-contained particle + mood layer: spawn
puffs, despawn poofs, win bursts from live `you`/`win` spots, ash motes on
defeat, and a board-wide pulse ripple (`PULSE_RIPPLE_MS_PER_CELL` delay by
distance). It reports a `BoardFxMood` the view controller adds on top of
the readability baselines.

## Render Loop Policy

Rendering is demand-driven — a persistent RAF is never kept for idle
animation alone:

- The runtime renders when `sync()` marks `needsRender`, while any node
  pose is animating, and while an effects pulse runs; it stops scheduling
  when everything settles.
- Sprite wobble frames advance on a plain interval (`SPRITE_FRAME_MS`) only
  while mounted; each tick just marks the frame dirty — no timer runs
  after `unmount()`/`dispose()`.
- `dispose()` cancels RAF/timers, runs `disposeBoard3dRendererResources`
  (geometries, materials, textures, composer, renderer) and blocks any
  post-dispose work.

## Pixel Sprites

`src/web/pixel-sprites/` is the shared pixel-art pipeline:

```text
data/*.ts        hand-authored sprites: 24×24 char frames, '.' = transparent,
                 3 wobble frames; objects/terrain/creatures/misc/objects-official
types.ts         PixelFrame / PixelSprite / PixelVolume model
derive.ts        frame ops: bounds, shift, mirror, rotate, wobble offsets,
                 SPRITE_GRID_SIZE/SPRITE_FRAME_COUNT
parts.ts         compose volumes from 3D primitives (box/wedge/…) into
                 self-contained PixelVolumes
voxel.ts         volume → BufferGeometry (per-face shading, card back layers)
blit.ts          frame → canvas painter (also used by menu-preview.ts)
arrows.ts        direction-arrow overlay frames
cross.ts         overridden-rule X mark frame
autotile.ts      8-neighbour mask constants
```

`board-3d-shared-item.ts` turns an `Item` into a `CardSpec` (label,
palette, sprite pick + facing orientation, idle-animation eligibility);
`board-3d-shared-math.ts` holds the easings; `board-3d-shared-types.ts` the
cross-module types (`CardSpec`, `BoardFxMood`).

## Config Split

`board-3d-config-*.ts` group constants by stable concern only — layout,
camera, lighting, shadow, postfx, textures, animation, effects, visuals,
voxel — re-exported through `board-3d-config.ts`. Behavior logic does not
belong in config files. `clay-config.ts` is the single preset entry:
palette, fog, bloom, AO, grade, lighting, material emissives, readability
guard rails, and camera tier selection.

## File Map

```text
src/web/
  board-3d-lazy.ts               lazy chunk boundary (imports the stack below)
  board-3d-mount.ts              async mount guard: pending invalidation, retry,
                                 dispose-blocking (all outside the chunk)
  board-3d-renderer-factory.ts   one-time resources + dep bundle
  board-3d-renderer-runtime.ts   mount/sync/unmount/dispose + RAF policy + hover
  board-3d-renderer-scene.ts     renderer/composer/lights/camera/sky
  board-3d-renderer-view.ts      viewport, camera tier, readability guard, fx mood
  board-3d-renderer-camera.ts    camera fit
  board-3d-renderer-lighting.ts  light rig placement/shadow fit
  board-3d-renderer-materials.ts Item → EntityVisual cache (voxel | plate)
  board-3d-renderer-dispose.ts   resource teardown
  board-3d-node-{create,pose,sync,types}.ts   entity node lifecycle
  board-3d-card-facing.ts        cards face camera
  board-3d-ground{,-shape}.ts    board base + shadow-camera fit
  board-3d-effects.ts            particles + win/lose mood
  board-3d-hover.ts              hover marker + cell raycast
  board-3d-textures.ts           canvas textures (cards, sky, shadow, toon ramp)
  board-3d-autotile.ts           terrain mask collection
  board-3d-shared-{item,layout,math,types}.ts spec/pose/layout helpers
  board-3d-config{,-*}.ts        grouped constants
  clay-config.ts                 CLAY_PRESET + readability/tier selectors
  pixel-sprites/                 sprite data → frames → blit/voxel
```

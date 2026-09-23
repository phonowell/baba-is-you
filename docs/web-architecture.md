# Web App Architecture

## Scope

`src/web` — the browser frontend. Dependency direction is one-way:
`web → view → logic`. Input vocabulary (`GameCommand`) and shared render
tables live in `src/view`; this layer owns DOM, Three.js, timers and the
reducer store. Entry point: `src/web/app.ts`.

## Layers & Data Flow

```text
DOM events ──► app-events / app-pointer / app-gamepad   (raw input → GameCommand via src/view/input*.ts)
                 │
                 ▼
            app-controller  (cooldown gate, command→action, "did it land?" check)
                 │  WebAppAction
                 ▼
            app-store ──► app-model reducer (pure)
                 │  notify only when hasViewStateChanged
                 ▼
   subscribers: draw (app-draw) · boardHover.refresh · status buzz · replay driver
                 │
                 ▼
            app-draw ──► view HTML (menu / game-view) + board-3d runtime mount·sync
```

`app.ts` keeps campaign parsing lazy: `levelData` is a `Proxy` that runs
`parseLevel` on first index access and fills real array slots, so every
downstream consumer (`env.levels`, golden resolution, previews) sees a
full `LevelData[]` while a session only pays the parse for boards it
enters or previews. Menu titles come from a title-only scan of the same
grammar (~0.2 ms for all 566 levels vs ~18 ms for full parses).

## State & Actions

`app-model.ts` is a pure reducer:

- `WebAppStateData`: `mode` (`menu` | `game`), `menuSelectedLevelIndex`,
  `levelIndex`, `state` (logic `GameState`), `history` (undo stack),
  `replay`, `customLevel` (a golden's recorded board, outside the campaign
  list), `showReferenceDialog`, `showReplayConfirm` (the Solution button's
  confirmation modal), `lastGameActionMs`, `levelCount`.
- `WebAppAction`: `select-menu-level`, `enter-game`, `return-to-menu`,
  `reset-level`, `move`, `undo`, `replay-step`, `start-replay`,
  `toggle/close-reference-dialog`, `open/close-replay-confirm`,
  `mark-game-action-handled`.
- `toWebAppSnapshot` projects the view-facing slice; `hasViewStateChanged`
  is the store's notify gate — a dispatch that changes nothing notifies
  nobody.

`app-store.ts` is a minimal store: `dispatch` runs the reducer, then fires
listeners only if the view state actually changed. `snapshot()`/`getState()`
serve reads; `subscribe()` returns an unsubscribe.

## Command Pipeline

`GameCommand` (`src/view/input.ts`) is the single input verb set:
`move dir`, `wait`, `enter`, `undo`, `restart`, `next`, `page`, `back`,
`noop`. Keyboard (`input-web.ts`), gamepad (`input-gamepad.ts`) and pointer
gestures (`mapBoardGesture`) all produce the same commands — HUD buttons
reuse the pipeline too (`GAME_ACTION_COMMANDS` in `app-events.ts`).

`app-commands.ts` (`mapGameCommandToAction`) interprets a command against
the current state:

- Menu: `move` steps the 5-column grid (`left`/`right` by cell, `up`/`down`
  by row, circular), `page` jumps `MENU_PAGE_ROWS` rows, `enter`/`next`
  start the selected level. A wrapped step landing back on the start cell
  maps to `null` — no action.
- Game: `move`/`wait` step the board; `undo` only when history exists;
  `restart` rebuilds (carrying `customLevel` when replaying a golden);
  `next` advances after `win`; `back` returns to menu. `enter` on a board
  is a true `null` no-op.
- Replay playback is spectating: every command is ignored except `back`
  (abort to menu).

Command honesty is enforced in `app-controller.ts`: `handleGameCommand`
dispatches the mapped action and reports handled only if `getState()`
changed — an invalid press is never counted as processed, so it neither
consumes the input cooldown (`GAME_INPUT_COOLDOWN_MS` = 100) nor fires
haptics.

## Input Sources

- **Keyboard** — `createWindowKeydownHandler` (`app-events.ts`): an open
  replay confirm swallows everything except Esc (cancel) and Enter
  (commit); Esc closes the reference dialog next; otherwise the mode's
  mapper runs through the cooldown gate; `preventDefault` only on
  handled commands.
- **Pointer** — `createAppPointerHandlers` (`app-pointer.ts`): game-board
  only. One press = at most one command: crossing `SWIPE_MIN_PX` (24)
  consumes the press as a move swipe; release under threshold is a tap →
  wait. Pointer capture keeps the gesture alive off-board; `preventDefault`
  on context menu. Between presses, non-touch pointers feed cell hover.
- **Gamepad** — `createGamepadRuntime` (`app-gamepad.ts`): the Gamepad API
  has no button events, so it polls — but only while a pad is connected
  (starts on `gamepadconnected`, stops when `getGamepads()` is empty).
  `select` toggles the reference dialog on its press edge; `x`/`start`
  are edge-only; `a`, `b` and held directions repeat on a 300 ms delay /
  140 ms cadence (still gated by the game cooldown). While either modal
  (reference dialog or replay confirm) is open, all input is swallowed
  except `b`, which cancels it. `rumble()` drives dual-rumble where
  offered.
- **Hover** — `createBoardHover` (`app-hover.ts`): in-scene cell marker +
  a small chip listing the cell's coordinates and cards. Recomputes after
  every draw so a parked cursor tracks items moving under it.

Portrait phones force landscape by rotating `#app` (style.css); pointer
deltas and hover points arrive in viewport space and are rotated back via
`mapViewportDelta`/`mapViewportPoint` before classification.

## Drawing

`createDraw` (`app-draw.ts`) is the single render entry — subscribed to the
store plus called on resize (60 ms debounce) and initial mount.

- **Menu** (`view/render-menu-html.ts`): full grid, in-place updates on
  selection change (class flip + position readout + preview start-index —
  full innerHTML re-renders would restart the entrance cascade and reset
  scroll). `orderMenuLevels` sorts solvable-first — a bound replay is what
  the menu calls "has a solution" — and `menuOrder` maps each grid slot
  back to its campaign index (the reducer does the same translation on
  `enter-game`/`return-to-menu`). The preview canvas is painted by
  `menu-preview.ts` (pixel-sprite board thumbnail). Cells with no bound
  golden dim (`hasSolution`).
- **Game** (`app-game-view.ts`): board container, toolbar, outcome
  overlay, reference dialog (controls + active rules), the
  replay-confirm modal, hover tip. The toolbar splits into two
  clusters — level badge + the bulb-marked Solution verb (when a golden
  is bound)
  on the left, the elastic status/hint line + Controls on the right.
  Rebuilt on board signature change; cheap fields update in place.
- **Board 3D**: `mountAndSyncBoard3d` (`board-3d-mount.ts`) is the lazy seam:
  it `import()`s `board-3d-lazy.ts` (the chunk that pulls in Three.js +
  postprocessing) only on first gameplay mount, then creates the renderer
  runtime (`createBoard3dRendererRuntime(createBoard3dRendererFactoryDeps())`),
  mounts into `.board`, syncs the new state. Pending mounts are invalidated by
  unmount/dispose; `preloadBoard3d()` fetches the chunk without instantiating
  WebGL. Details in [docs/rendering-3d.md](./rendering-3d.md).

`applyWithTransition` (`app-view-helpers.ts`) wraps DOM writes in
`document.startViewTransition` when available and not
`prefers-reduced-motion`.

## Golden Replays

- Binding runs at **build time** (`scripts/build-single-html.ts`), not at
  startup: `buildGoldenIndex` resolves every `goldens/**/*.json` through
  `bindGoldensToLevels` and emits two artifacts — the `baba-golden-index`
  virtual module (a `levelIndex → goldenName` map powering the menu's
  `hasSolution` ordering and the Replay button's visibility) and a
  slimmed `goldens.json` payload holding **bound records only** (unbound
  recordings are unreachable and not shipped). A bound entry whose
  embedded `levelData`/`levelText` parses identically to the campaign
  board is stripped to `{name, inputs, levelSource, levelIndex}` — the
  runtime resolves it back through `campaignLevels[levelIndex]`.
- `app-golden-binding.ts` (`bindGoldensToLevels`) is the build/test-side
  ranker: explicit `levelIndex` wins; else unique normalized title, else
  unique layout signature (name+isText+cell set; facing/dupes collapse).
  Ambiguous records stay unbound rather than guessing.
- `app-goldens.ts` (`createGoldenStore`) is the runtime side:
  `nameForLevelIndex` is a synchronous index lookup; `loadByName`
  fetches+decodes the payload once, then `resolveGolden`s only the
  requested entry (parseLevel included — a replay click never parses the
  other recordings); `loadedForLevel` matches already-loaded goldens by
  object identity then layout signature (the replay board IS the golden's
  own LevelData). A failed payload read clears the memo so the next
  request retries cleanly.
- The Solution button never plays directly: `play-replay` opens the
  `showReplayConfirm` modal (playback rebuilds the board, so the ask
  names the lost progress); only its `confirm-replay` — or Enter — runs
  `playReplay` → `start-replay`. Backdrop clicks, Cancel and Esc dismiss.
- `app-replay.ts` drives playback: one `replay-step` per 500 ms tick while
  `isReplaying()`; the timer exists only during playback and dies on
  finish, back-out, or dispose. `replay-step` consumes one `u/d/l/r/w/z`
  code per dispatch through the real `step()`.

## Packaged Payloads

`scripts/build-single-html.ts` emits each module/payload as an independent
gzip+XOR+base64 pack entry; the inlined loader (`src/web/pack-format.ts`
functions baked verbatim) decodes entries, rewrites static imports between
payloads to blob URLs, and routes `import()` back through the loader.
`__babaPack.import(spec, importer)` is the runtime seam used by `app-goldens`
and `board-3d-mount`; its ambient declaration lives in `pack-runtime.d.ts`.
Local builds embed every payload in one HTML; deploy builds embed only eager
payloads in `baba-is-you.js` and serve lazy ones from `release/payloads/`
(see [docs/deploy.md](./deploy.md)).

## Host Gate & Lifecycle

- `host-gate.ts`: deploy builds bake `__BABA_ALLOWED_HOSTS__` via esbuild
  define; a hostname outside the list renders the lock message and aborts
  before any game code. Local builds inject `null` (unlocked). See
  [docs/deploy.md](./deploy.md).
- `registerAppLifecycle` (`app-lifecycle.ts`) owns every DOM listener;
  `disposeApp` removes them, disposes the 3D renderer, the gamepad loop,
  the replay driver and the subscriptions, and clears
  `__baba_is_you_web_dispose__` — the re-entry hook that makes a second
  script evaluation (HMR, replayed bundle) tear down the first instance.

## File Map

```text
src/web/
  app.ts                  composition root: build store/controller/draw/inputs, wire subscribers, dispose key
  app-model.ts            WebAppStateData / actions / reducer (pure)
  app-store.ts            dispatch + subscribe + change gate
  app-controller.ts       cooldown, command honesty, keyboard/menu event entry
  app-commands.ts         GameCommand → WebAppAction per mode
  app-events.ts           click delegation ([data-action]), menu hover, keydown
  app-pointer.ts          swipe/tap/hover gestures
  app-gamepad.ts          pad polling loop, repeat, rumble
  app-hover.ts            cell hover marker + tip
  app-draw.ts             render entry: menu in-place vs game-view rebuild
  app-game-view.ts        game DOM: board, HUD, dialog, outcome overlay
  app-view-helpers.ts     view transitions, cell size
  app-lifecycle.ts        listener registration + dispose
  app-replay.ts           golden playback interval driver
  app-goldens.ts          golden index + lazy payload store → GoldenReplay records
  app-golden-binding.ts   record → campaign level binding
  pack-format.ts          pack-format pure fns shared by build script & loader
  pack-runtime.d.ts       __babaPack ambient declaration
  board-3d-lazy.ts        lazy chunk boundary: imports the real 3D stack
  board-3d-mount.ts       async mount guard (pending invalidation, retry, dispose)
  menu-preview.ts         menu preview canvas painter
  host-gate.ts            deploy hostname lock
  style.css               app stylesheet (menu/game DOM, forced-landscape rotation)
  board-3d-*.ts           3D renderer (see docs/rendering-3d.md)
  pixel-sprites/          sprite data → frames → blit/voxel
  clay-config.ts          single fixed visual preset + readability mix
```

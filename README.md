# Baba Is You

English | [中文](./README.zh-CN.md) | [日本語](./README.ja.md)

Baba Is You with a pure logic core and a single-file Web frontend (`src/web/app.ts`).

**Play online: https://auvya.com/baba**

## Quick Start

```bash
pnpm install
pnpm build
pnpm verify-levels:official   # needs the local data/baba dump (gitignored)
pnpm test
pnpm lint
pnpm type-check
```

## Core Commands

| Command | Description |
|---------|-------------|
| `pnpm check` | Lint + type-check + test in one step |
| `pnpm build` | Build the local single-file web output (`release-local/baba-is-you.html`) |
| `pnpm build:deploy` | Build the deployable shell + gated bundle (`release/`) |
| `pnpm deploy` | Build the deployable bundle and publish to `auvya.com/baba` (see `docs/deploy.md`) |
| `pnpm watch` | Rebuild the single-file web output on change |
| `pnpm verify-levels:official` | Verify imported official level text against the local `data/baba/*.(l|ld)` dump (gitignored, not committed) |
| `pnpm import-levels:official` | Re-import official levels into `src/levels-data/*.ts` |
| `pnpm test` | Run `src/**/*.test.ts` |
| `pnpm lint` | Normalize UTF-8/LF, then oxlint `src/` |
| `pnpm type-check` | Type check without emit |

## Controls

- The app boots on a flat level menu: a numbered grid of all campaign levels plus a preview canvas for the highlighted one. `WASD`/arrows step the selection (`left`/`right` by cell, `up`/`down` by row), `PgUp`/`PgDn` page rows, `Enter`/`Space`/`N` or a click/tap enters the level; hovering a cell selects it and paints its preview
- In game: `WASD` or arrows move, `Space` wait, `U/Z` undo, `R` restart, `N/Enter` advance to the next level after winning, `Q` back to menu
- HUD buttons mirror the keyboard verbs (undo / wait / restart / menu); a **Solution** button plays the recorded golden replay when the level on screen has one — during playback every command is ignored except `Q` (abort to menu)
- Touch: swipe moves, tap waits; the HUD buttons cover the rest; portrait phones are rotated into forced landscape
- Gamepad (standard layout): `D-Pad`/left stick move or navigate the menu, `A` wait / enter, `B` undo / back / close dialog, `X` restart, `Start` back, `Select` controls & rules dialog; hold `A`/`B` to repeat wait/undo; win/lose pulses the rumble where the hardware offers it

## Rule System (Implemented)

- Operators: `X IS Y`, `X HAS Y`, `X MAKE Y`, `X EAT Y`, `X WRITE Y`, `X FEAR Y`, `X FOLLOW Y`, `X MIMIC Y`, `X PLAY Y`, `X BECOME Y`
- Connective / negation: `AND`, `NOT` (on the subject, the object, and the condition object)
- Infix conditions: `ON`, `NEAR`, `FACING`, `NEXTTO`, `FACEDBY`, `SEEING`, `WITHOUT`, `ABOVE`, `BELOW`, `BESIDELEFT`, `BESIDERIGHT`, `FEELING`
- Prefix conditions: `LONELY`, `IDLE`, `OFTEN`, `SELDOM`, `POWERED`, `POWERED2`, `POWERED3`
- Special nouns: `TEXT`, `EMPTY`, `ALL`, `GROUP`, `GROUP2`, `GROUP3`, `LEVEL`
- Letter units (`a`–`z`, `0`–`9`, `sharp`, `flat`, `ab`, `ba`) are never standalone words — a contiguous run of ≥2 letter cells spells every dictionary-word substring into the rules; in `PLAY` levels they switch to the note dictionary
- Properties: the full official type-2 vocabulary in `src/logic/types.ts` (`CORE_PROPERTIES`) — `you`/`you2`/`3d`, `win`/`end`/`done`, `stop`, `push`, `pull`, `move`, `auto`, `chill`, `open`, `shut`, `defeat`, `sink`, `hot`, `melt`, `weak`, `float`, `tele`, `shift`, `swap`, `facing`, `up`/`right`/`down`/`left`, `fall`/`fallup`/`fallleft`/`fallright`, `back`, `reverse`, `revert`, `more`, `hide`, `sleep`, `still`, `broken`, `safe`, `word`, `phantom`, `hold`, `select`, `boom`, `turn`, `deturn`, `nudge*`, `locked*`, `power`/`power2`/`power3`, `bonus`, `best`, `group`/`group2`/`group3`, plus inert emotion/color/meta words (`wonder`, `sad`, `happy`, `angry`, `party`, `pet`, `red`, `blue`, …) that parse as properties so imported rule text never degrades into nouns

## Rendering

- Web: fixed square board; text tiles render full words; controls and the active ruleset are available in the in-game dialog
- Web 3D path uses one fixed clay-look preset with no runtime switch: sprite-backed objects render as voxel-extruded pixel sprites; other items (text/emoji/glyph labels) render as textured plates; facing directions show as raised arrow overlays
- Web 3D upright stack order is fixed: `cursor > you > text > move/fall > push/pull > open/shut > else`
- Ground-hug objects (`tile`, `water`, `lava`, `belt`, `line`, and imported `tile_*` floor art) lie flat and skip the upright stack priority
- `level is you`/`move`/`fall*`/`push`/`pull` scrolls or rotates the whole room — a pure render offset, never a logical move
- Rendering is demand-driven: no persistent RAF for idle animation alone

## Single-file HTML

```bash
pnpm build
```

- Output: `release-local/baba-is-you.html`
- The file is self-contained and can be opened offline in a browser
- `pnpm build:deploy` instead emits `release/baba-is-you.html` (shell loader) + `release/baba-is-you.js` (gated bundle that only runs on `auvya.com`) — see [docs/deploy.md](./docs/deploy.md)

## Level Source

- Entry: `src/levels.ts` — aggregates 12 data packs (`src/levels-data/00-official.ts` … `11-official.ts`, ~566 levels) generated by `pnpm import-levels:official`
- Official `leveltype=1` overworld maps are parsed during import verification only — the app selects levels from the flat menu, no playable map data is generated
- `levels/**/*.txt`: text fixtures in the entity-list format parsed by `src/logic/parse-level.ts` (used by golden replays; supports stacked entities per cell)
- `goldens/**/*.json`: recorded winning playthroughs, replay-asserted wholesale by `src/logic/goldens.test.ts` and bound to campaign levels in the app for the Solution button

## Structure

```text
src/
  levels.ts
  levels-data/
  logic/
  tools/
  view/
  web/
```

## Tech Stack

- Node.js + TypeScript + ESM
- Runtime: `tsx`
- Web: Three.js + postprocessing + n8ao
- Lint: oxlint (`.oxlintrc.json`)

## Development Notes

See [AGENTS.md](./AGENTS.md) and the [docs index](./docs/README.md)
- Logic architecture: [docs/logic-architecture.md](./docs/logic-architecture.md)
- Web app architecture: [docs/web-architecture.md](./docs/web-architecture.md)
- 3D renderer: [docs/rendering-3d.md](./docs/rendering-3d.md)
- Level data & goldens: [docs/level-data.md](./docs/level-data.md)

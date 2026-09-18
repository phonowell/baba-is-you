# Baba Is You

English | [中文](./README.zh-CN.md) | [日本語](./README.ja.md)

Baba Is You with a pure logic core and a single-file Web frontend (`src/web/app.ts`).

## Quick Start

```bash
pnpm install
pnpm build
pnpm verify-levels:official
pnpm test
pnpm lint
pnpm type-check
```

## Core Commands

| Command | Description |
|---------|-------------|
| `pnpm check` | Lint + type-check + test in one step |
| `pnpm simulate` | Headless level stepping, e.g. `pnpm simulate 0 rrdl --trace` |
| `pnpm build` | Build single-file web output (`release/baba-is-you.html`) |
| `pnpm verify-levels:official` | Verify imported official level text from `data/baba/*.(l|ld)` |
| `pnpm import-levels:official` | Re-import official levels into `src/levels-data/*.ts` |
| `pnpm test` | Run `src/**/*.test.ts` |
| `pnpm lint` | Normalize UTF-8/LF, then oxlint `src/` |
| `pnpm type-check` | Type check without emit |

## Controls

- Menu: `W/S` or `Up/Down` select, `A/D` or `Left/Right` page, `Enter/N/Space` start, `Q` quit
- In game: `WASD` or arrows move, `Space` wait, `U` undo, `R` restart, `N/Enter` next after win, `Q` back to menu

## Rule System (Implemented)

- Operators: `X IS Y`, `X HAS Y`, `X MAKE Y`, `X EAT Y`, `X WRITE Y`
- Connective / negation: `AND`, `NOT`
- Conditions: `ON`, `NEAR`, `FACING`, `LONELY`
- Special nouns: `TEXT`, `EMPTY`, `ALL`, `GROUP`, `LEVEL`
- Properties: `you`, `win`, `stop`, `push`, `move`, `open`, `shut`, `defeat`, `sink`, `hot`, `melt`, `weak`, `float`, `tele`, `pull`, `shift`, `swap`, `up`, `right`, `down`, `left`, `red`, `blue`, `best`, `fall`, `more`, `hide`, `sleep`, `group`, `facing`

## Rendering

- Web: fixed square board; text tiles render full words; rules and legend are available in the in-game dialog
- Web 3D path uses one fixed clay-look preset: ground uses solid-color material, cards use simplified texture labels (text/emoji/direction), with no runtime preset switch
- Web 3D upright stack order is fixed: `you > text > move/fall > push/pull > open/shut > else`
- Ground-hug objects (`tile`, `water`, `belt`) are excluded from upright stack priority

## Single-file HTML

```bash
pnpm build
```

- Output: `release/baba-is-you.html`
- The file is self-contained and can be opened offline in a browser

## Level Source

- Entry: `src/levels.ts`
- Data packs: `src/levels-data/00-official.ts`, `src/levels-data/01-official.ts`, `src/levels-data/02-official.ts`

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
- Lint: oxlint (`.oxlintrc.json`)

## Development Notes

See [AGENTS.md](./AGENTS.md)
- Logic architecture: [docs/logic-architecture.md](./docs/logic-architecture.md)

# Baba Is You CLI

English | [中文](./README.zh-CN.md) | [日本語](./README.ja.md)

A terminal version of Baba Is You with a pure logic core and a stateless renderer.

## Quick Start

```bash
pnpm install
pnpm start
pnpm lint
pnpm type-check
```

## Core Commands

| Command | Description |
|---------|-------------|
| `pnpm start` | Run the game (`src/cli.ts`) |
| `pnpm lint` | Lint and auto-fix `src/**/*.ts` |
| `pnpm type-check` | Type check without emit |

## Gameplay

- Move: WASD or Arrow keys
- Undo: U
- Restart: R
- Next level / Restart after clear: N or Enter
- Quit: Q or Ctrl+C

## Rules (Core)

- Supported: `X IS Y`
- Properties: you, win, stop, push, defeat, sink, hot, melt
- Not supported: has, and, not, on, make

## Rendering

- Fixed 2-column cells
- Text tiles are 2-letter codes; IS has distinct color
- Rule list and legend are shown below the board
- ANSI colors are used where available

## Level Source

- `src/levels.ts` is generated from `../kikyo/source/static/script/include/data.coffee`

## Structure

```
src/
  cli.ts
  levels.ts
  logic/
  view/
```

## Tech Stack

- Node.js + TypeScript + ESM
- Runtime: tsx
- Lint: ESLint (`eslint.config.mjs`)

## Development Notes

See [CLAUDE.md](./CLAUDE.md)

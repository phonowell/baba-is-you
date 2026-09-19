import type { Direction } from './types.js'

// Replay input codec — the single source for the `u/d/l/r/w/z` encoding
// shared by the golden test replay (`replay.ts`) and the web playback
// driver. Kept node-dep-free so the web bundle may import it (replay.ts
// itself pulls in node:crypto for hashing and must stay off the web path).

const INPUT_DIRS: Record<string, Direction> = {
  u: 'up',
  d: 'down',
  l: 'left',
  r: 'right',
}

export type ReplayStep =
  | { kind: 'move'; direction: Direction | null }
  | { kind: 'undo' }
  | { kind: 'skip' }

// `w` waits (a null-direction move), `z` undoes one committed move,
// `u/d/l/r` move; anything else is skipped without consuming a turn.
export const decodeReplayInput = (code: string): ReplayStep => {
  if (code === 'z') return { kind: 'undo' }
  if (code === 'w') return { kind: 'move', direction: null }
  const direction = INPUT_DIRS[code]
  if (direction === undefined) return { kind: 'skip' }
  return { kind: 'move', direction }
}

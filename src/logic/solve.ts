import { step } from './step.js'
import { isYouLike } from './step/shared.js'

import type { Direction, GameState, RuleKind } from './types.js'

// State-space search over the step() pipeline. The engine is a pure
// function, so BFS with a transposition table gives the shortest solution
// under our semantics; a drained frontier means provably unwinnable within
// the explored space. Baba Is You is PSPACE-complete in the general case —
// the caps below turn "too big" into `unknown` rather than a wrong answer.

export type SolveResult =
  | { kind: 'solved'; inputs: string; depth: number; expanded: number }
  | { kind: 'exhausted'; expanded: number }
  | {
      kind: 'cutoff'
      // 'exhausted' is only emitted by beam search — a truncated frontier
      // that ran dry proves nothing about the pruned branches.
      reason: 'depth' | 'states' | 'timeout' | 'exhausted'
      expanded: number
    }

// `bfs` proves the shortest solution. `greedy`/`astar`/`wastar` rank by
// the wall-aware you→win distance and dive faster on open boards, but
// tele/swap jumps can beat any distance estimate — the heuristic is
// inadmissible, so their solutions are valid wins, not proven optima.
// `beam` caps each depth layer to `beamWidth` best-ranked nodes: fastest
// and deepest, but trades away both optimality and exhaustion proofs.
export type SolveStrategy = 'bfs' | 'greedy' | 'astar' | 'wastar' | 'beam'

export type SolveCaps = {
  maxDepth: number
  maxStates: number
  deadlineMs: number
  beamWidth?: number
}

// Action encoding matches replay-input.ts: u/d/l/r move, w waits.
const ACTIONS: ReadonlyArray<{ code: string; direction: Direction | null }> = [
  { code: 'u', direction: 'up' },
  { code: 'd', direction: 'down' },
  { code: 'l', direction: 'left' },
  { code: 'r', direction: 'right' },
  { code: 'w', direction: null },
]

// Props that move or otherwise change entities without player input. A
// board with none of them (and no autonomous/empty/level-subject rules)
// can only change through `you` movement, so `w` is provably a no-op
// there — skipping it saves a full step() call per expanded node.
// `more`/`boom` fire every step (dupes / detonation), `tele` re-rolls a
// pad occupant's destination per turn, `often`/`seldom`/`idle` rules make
// wait meaningful again, as do `empty is …`/`level is …` rules.
const AUTO_PROPS = new Set([
  'move',
  'auto',
  'fall',
  'fallleft',
  'fallright',
  'fallup',
  'chill',
  'nudgeleft',
  'nudgeright',
  'nudgeup',
  'nudgedown',
  'turn',
  'deturn',
  'shift',
  'back',
  'more',
  'boom',
  'tele',
])
// `fear`/`follow`/`mimic` are rule kinds, never item props — their
// autonomous movement only shows up in `state.rules`, so it must be
// detected there rather than via AUTO_PROPS.
const AUTONOMOUS_RULE_KINDS = new Set<RuleKind>(['fear', 'follow', 'mimic'])
const TURN_SENSITIVE_CONDITIONS = new Set(['often', 'seldom', 'idle'])

type BoardActivity = { hasYou: boolean; hasAuto: boolean; hasVirtualRules: boolean }

const boardActivity = (state: GameState): BoardActivity => {
  let hasYou = false
  let hasAuto = false
  for (const item of state.items) {
    if (isYouLike(item)) hasYou = true
    if (item.props.some((prop) => AUTO_PROPS.has(prop))) hasAuto = true
  }
  let hasVirtualRules = false
  let hasTurnRules = false
  for (const rule of state.rules) {
    if (rule.subject === 'empty' || rule.subject === 'level')
      hasVirtualRules = true
    if (AUTONOMOUS_RULE_KINDS.has(rule.kind)) hasAuto = true
    if (rule.condition && TURN_SENSITIVE_CONDITIONS.has(rule.condition.kind))
      hasTurnRules = true
  }
  return {
    hasYou,
    hasAuto: hasAuto || hasTurnRules,
    hasVirtualRules,
  }
}

// `often`/`seldom` rolls, `chill` picks, and `tele` destinations are all
// seeded by `turn` — merging same-layout boards across turns can prune a
// branch that only wins on the right turn, so those boards keep `turn` in
// the key. Everything else derives from the layout, so merging stays
// free for the common case.
const isTurnSeeded = (state: GameState): boolean => {
  for (const rule of state.rules) {
    const kind = rule.condition?.kind
    if (kind === 'often' || kind === 'seldom') return true
    if (
      rule.kind === 'is-property' &&
      rule.subject === 'level' &&
      (rule.object === 'chill' || rule.object === 'tele')
    )
      return true
  }
  return state.items.some((item) =>
    item.props.some((prop) => prop === 'chill' || prop === 'tele'),
  )
}

// Canonical layout key: same-name entities are interchangeable, so items
// are sorted by their visible tuple. `props`/`rules`/`overriddenTextIds`
// are re-derived from the layout each step and need no slots; `history`
// and `levelOffset` are excluded on purpose — merging boards that differ
// only there can hide a win behind a different RNG roll, so the failure
// mode is a safe `unknown`, never a false `solved`.
const stateKey = (state: GameState): string => {
  const parts = state.items.map(
    (item) =>
      `${item.name}@${item.x},${item.y}${item.dir ? `:${item.dir}` : ''}${
        item.isText ? '!' : ''
      }${item.originName !== undefined ? `#${item.originName}` : ''}${
        item.prevX !== undefined ? `~${item.prevX},${item.prevY}` : ''
      }`,
  )
  parts.sort()
  const turn = isTurnSeeded(state) ? `t${state.turn}|` : ''
  return `${state.status}|${state.levelDir ?? ''}|${turn}${parts.join(';')}`
}

// Guided distance: multi-source BFS from every `win` cell over the grid,
// treating `stop`-prop cells as walls, then the nearest you cell's depth.
// Falls back to a large penalty plus Manhattan when no win is reachable so
// the frontier still prefers closer boards. Boards without you or win rank
// 0, keeping FIFO order. One grid scan costs less than a step() call, so
// it pays for itself whenever the wall-aware ranking saves expansions.
const winDistance = (state: GameState): number => {
  const { width, height } = state
  const cells = width * height
  const blocked = new Uint8Array(cells)
  const dist = new Int32Array(cells).fill(-1)
  const queue: number[] = []
  const wins: number[] = []
  for (const item of state.items) {
    const cell = item.y * width + item.x
    if (item.props.includes('win')) {
      dist[cell] = 0
      queue.push(cell)
      wins.push(cell)
    }
    if (item.props.includes('stop')) blocked[cell] = 1
  }
  // Rule-assembly fallback: with no live `win` prop, the only progress
  // signal is moving a `win` text card next to an `is` card so `X IS WIN`
  // can form. Same for `you` when nothing is controllable yet.
  const textAssemble = (word: string): number => {
    let best = Number.POSITIVE_INFINITY
    for (const a of state.items) {
      if (!a.isText || a.name !== word) continue
      for (const b of state.items) {
        if (!b.isText || b.name !== 'is') continue
        const d = Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
        if (d < best) best = d
      }
    }
    return best === Number.POSITIVE_INFINITY ? cells : best
  }
  if (queue.length === 0) {
    const hasYou = state.items.some((i) => i.props.includes('you'))
    return textAssemble('win') + (hasYou ? 0 : textAssemble('you'))
  }
  for (let head = 0; head < queue.length; head += 1) {
    const cell = queue[head] as number
    const x = cell % width
    const y = (cell / width) | 0
    const next = dist[cell] as number + 1
    const neighbors = [
      x > 0 ? cell - 1 : -1,
      x < width - 1 ? cell + 1 : -1,
      y > 0 ? cell - width : -1,
      y < height - 1 ? cell + width : -1,
    ]
    for (const n of neighbors) {
      if (n >= 0 && dist[n] === -1 && !blocked[n]) {
        dist[n] = next
        queue.push(n)
      }
    }
  }
  let best = Number.POSITIVE_INFINITY
  let nearestWin = Number.POSITIVE_INFINITY
  for (const item of state.items) {
    if (!item.props.includes('you')) continue
    const cell = item.y * width + item.x
    const d = dist[cell] ?? -1
    if (d >= 0) {
      if (d < best) best = d
      continue
    }
    for (const win of wins) {
      const manhattan =
        Math.abs(item.x - (win % width)) +
        Math.abs(item.y - ((win / width) | 0))
      if (manhattan < nearestWin) nearestWin = manhattan
    }
  }
  if (best < Number.POSITIVE_INFINITY) return best
  if (nearestWin < Number.POSITIVE_INFINITY) return cells + nearestWin
  return 0
}

type Frontier = {
  push: (node: { state: GameState; inputs: string; score: number }) => void
  pop: () => { state: GameState; inputs: string; score: number } | undefined
  readonly size: number
}

// BFS uses a plain index-advancing queue; greedy uses a binary min-heap
// on (score, insertion order) so equal ranks still come out FIFO.
const createFrontier = (strategy: SolveStrategy): Frontier => {
  type Node = { state: GameState; inputs: string; score: number; seq: number }
  if (strategy === 'bfs') {
    const queue: Node[] = []
    let head = 0
    return {
      push: (node) => {
        queue.push({ ...node, seq: queue.length })
      },
      pop: () => {
        const node = queue[head]
        if (node !== undefined) head += 1
        return node
      },
      get size() {
        return queue.length - head
      },
    }
  }

  const heap: Node[] = []
  let seq = 0
  const less = (a: Node, b: Node): boolean =>
    a.score < b.score || (a.score === b.score && a.seq < b.seq)
  const siftUp = (index: number): void => {
    while (index > 0) {
      const parent = (index - 1) >> 1
      const parentNode = heap[parent]
      const node = heap[index]
      if (!parentNode || !node || !less(node, parentNode)) return
      heap[parent] = node
      heap[index] = parentNode
      index = parent
    }
  }
  const siftDown = (index: number): void => {
    for (;;) {
      const left = index * 2 + 1
      const right = left + 1
      let smallest = index
      const leftNode = heap[left]
      const rightNode = heap[right]
      const smallestNode = heap[smallest]
      if (leftNode && smallestNode && less(leftNode, smallestNode))
        smallest = left
      const currentSmallest = heap[smallest]
      if (rightNode && currentSmallest && less(rightNode, currentSmallest))
        smallest = right
      if (smallest === index) return
      const tmp = heap[index]
      const swap = heap[smallest]
      if (!tmp || !swap) return
      heap[index] = swap
      heap[smallest] = tmp
      index = smallest
    }
  }
  return {
    push: (node) => {
      heap.push({ ...node, seq })
      seq += 1
      siftUp(heap.length - 1)
    },
    pop: () => {
      const top = heap[0]
      if (top === undefined) return undefined
      const last = heap.pop()
      if (heap.length > 0 && last) {
        heap[0] = last
        siftDown(0)
      }
      return top
    },
    get size() {
      return heap.length
    },
  }
}

// Beam search keeps the frontier as a single sorted layer instead of a
// queue: everything at depth d is expanded, ranked, and truncated before
// depth d+1 starts.
const solveBeam = (initial: GameState, caps: SolveCaps): SolveResult => {
  const deadline = Date.now() + caps.deadlineMs
  const width = caps.beamWidth ?? 5000
  const visited = new Set<string>([stateKey(initial)])
  let layer: Array<{ state: GameState; inputs: string }> = [
    { state: initial, inputs: '' },
  ]
  let expanded = 0

  for (let depth = 0; depth <= caps.maxDepth; depth += 1) {
    if (Date.now() > deadline)
      return { kind: 'cutoff', reason: 'timeout', expanded }
    const nextLayer: Array<{ state: GameState; inputs: string; score: number }> =
      []
    for (const node of layer) {
      if (node.state.status === 'win') {
        return {
          kind: 'solved',
          inputs: node.inputs,
          depth: node.inputs.length,
          expanded,
        }
      }
      if (node.state.status === 'lose') continue
      expanded += 1
      const activity = boardActivity(node.state)
      if (!activity.hasYou && !activity.hasAuto && !activity.hasVirtualRules)
        continue
      for (const action of ACTIONS) {
        if (
          action.direction === null &&
          !activity.hasAuto &&
          !activity.hasVirtualRules
        )
          continue
        const result = step(node.state, action.direction)
        if (!result.changed) continue
        const key = stateKey(result.state)
        if (visited.has(key)) continue
        visited.add(key)
        if (visited.size > caps.maxStates) {
          return { kind: 'cutoff', reason: 'states', expanded }
        }
        nextLayer.push({
          state: result.state,
          inputs: node.inputs + action.code,
          score: winDistance(result.state),
        })
      }
    }
    if (nextLayer.length === 0)
      return { kind: 'cutoff', reason: 'exhausted', expanded }
    nextLayer.sort((a, b) => a.score - b.score)
    layer = nextLayer.slice(0, width)
  }
  return { kind: 'cutoff', reason: 'depth', expanded }
}

export const solveState = (
  initial: GameState,
  caps: SolveCaps,
  strategy: SolveStrategy = 'bfs',
): SolveResult => {
  if (strategy === 'beam') return solveBeam(initial, caps)
  const deadline = Date.now() + caps.deadlineMs
  const visited = new Set<string>([stateKey(initial)])
  const frontier = createFrontier(strategy)
  frontier.push({ state: initial, inputs: '', score: 0 })
  let expanded = 0

  for (;;) {
    const node = frontier.pop()
    if (!node) return { kind: 'exhausted', expanded }
    if ((expanded & 1023) === 0 && Date.now() > deadline) {
      return { kind: 'cutoff', reason: 'timeout', expanded }
    }
    const depth = node.inputs.length
    if (depth > caps.maxDepth) {
      // BFS pops in depth order; the heap does not, so only the FIFO
      // frontier may treat this as a final cutoff.
      if (strategy === 'bfs') return { kind: 'cutoff', reason: 'depth', expanded }
      continue
    }
    const state = node.state
    if (state.status === 'win') {
      return { kind: 'solved', inputs: node.inputs, depth, expanded }
    }
    if (state.status === 'lose') continue
    expanded += 1

    // Static board: nothing can move, wait, or rewire rules — every action
    // is a no-op, so expanding would just churn five step() calls.
    const activity = boardActivity(state)
    if (!activity.hasYou && !activity.hasAuto && !activity.hasVirtualRules)
      continue

    for (const action of ACTIONS) {
      if (action.direction === null && !activity.hasAuto && !activity.hasVirtualRules)
        continue
      const result = step(state, action.direction)
      if (!result.changed) continue
      const next = result.state
      const key = stateKey(next)
      if (visited.has(key)) continue
      visited.add(key)
      if (visited.size > caps.maxStates) {
        return { kind: 'cutoff', reason: 'states', expanded }
      }
      frontier.push({
        state: next,
        inputs: node.inputs + action.code,
        score:
          strategy === 'astar'
            ? node.inputs.length + 1 + winDistance(next)
            : strategy === 'wastar'
              ? node.inputs.length + 1 + 5 * winDistance(next)
              : winDistance(next),
      })
    }
  }
}

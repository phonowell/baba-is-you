import { resolveActiveEmptyProps } from './empty.js'
import { prepareStep, step } from './step.js'
import { isYouLike } from './step/shared.js'

import { SPECIAL_NOUN_WORDS } from './types.js'

import type { Direction, GameState, Item, RuleKind } from './types.js'

// State-space search over the step() pipeline. The engine is a pure
// function, so BFS with a transposition table gives the shortest solution
// under our semantics; a drained frontier means provably unwinnable within
// the explored space. Baba Is You is PSPACE-complete in the general case —
// the caps below turn "too big" into `unknown` rather than a wrong answer.

export type SolveResult =
  | {
      kind: 'solved'
      inputs: string
      depth: number
      expanded: number
      // The reached winning state — waypoint searches chain their next
      // segment from it, so the splice only ever feeds real successors.
      state: GameState
    }
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
// `macro` switches granularity entirely — Sokoban-style pushes/pulls and
// walks-to-goal as single decisions, so a 60-cell corridor costs one
// node instead of sixty; every macro's outcome is still produced by the
// real step() pipeline, which keeps results exact.
export type SolveStrategy =
  | 'bfs'
  | 'greedy'
  | 'astar'
  | 'wastar'
  | 'beam'
  | 'macro'

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
const isTurnSeeded = (state: GameState, chillOrTele: boolean): boolean => {
  if (chillOrTele) return true
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
  return false
}

// Canonical layout tuples: same-name entities are interchangeable, so
// items are sorted by their visible tuple. `props`/`rules`/
// `overriddenTextIds` are re-derived from the layout each step and need
// no slots in the key. The pass also reports `chill`/`tele` props so the
// turn-seeded check doesn't scan the items a second time.
const scanItemTuples = (
  state: GameState,
): { joined: string; chillOrTele: boolean } => {
  let chillOrTele = false
  const parts = state.items.map((item) => {
    if (!chillOrTele)
      chillOrTele = item.props.includes('chill') || item.props.includes('tele')
    return `${item.name}@${item.x},${item.y}${item.dir ? `:${item.dir}` : ''}${
      item.isText ? '!' : ''
    }${item.originName !== undefined ? `#${item.originName}` : ''}${
      item.prevX !== undefined ? `~${item.prevX},${item.prevY}` : ''
    }`
  })
  parts.sort()
  return { joined: parts.join(';'), chillOrTele }
}

// Waypoint-goal identity: board contents and status only. `turn` and
// `levelDir` are timing/render details a differently-shaped detour is
// allowed to shift — the full-path replay after a spliced solve is what
// verifies the result.
const layoutKey = (state: GameState): string =>
  `${state.status}|${scanItemTuples(state).joined}`

// Dedupe identity for open search. `history` and `levelOffset` are
// excluded on purpose — merging boards that differ only there can hide a
// win behind a different RNG roll, so the failure mode is a safe
// `unknown`, never a false `solved`.
const stateKey = (state: GameState): string => {
  const scan = scanItemTuples(state)
  const turn = isTurnSeeded(state, scan.chillOrTele)
    ? `t${state.turn}|`
    : ''
  return `${state.status}|${state.levelDir ?? ''}|${turn}${scan.joined}`
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
  // Rule-assembly fallback: with no live `win` prop, progress means
  // forming `X IS WIN` (and `X IS YOU` when nothing is controllable).
  // A rule needs three cards on one line — subject, `is`, object — so
  // the cost is a shared-`is` pairing: the cheapest (noun-text, is) +
  // (object-text, same is) Manhattan sum over every candidate noun that
  // has a unit or card on the board.
  const textItems = state.items.filter((item) => item.isText)
  const isCards = textItems.filter((item) => item.name === 'is')
  const nouns = new Set<string>()
  for (const item of state.items) {
    if (!item.isText) nouns.add(item.name)
  }
  // `text is …` rules are also formable — a text card can be the
  // subject — as can the special nouns (`empty is win`, `all is you`).
  if (textItems.length > 0) nouns.add('text')
  for (const word of SPECIAL_NOUN_WORDS) nouns.add(word)
  const assembleCost = (object: string): number => {
    const objects = textItems.filter((item) => item.name === object)
    if (!objects.length || !isCards.length)
      return Number.POSITIVE_INFINITY
    let best = Number.POSITIVE_INFINITY
    for (const is of isCards) {
      let nearestObject = Number.POSITIVE_INFINITY
      for (const o of objects) {
        const d = Math.abs(o.x - is.x) + Math.abs(o.y - is.y)
        if (d < nearestObject) nearestObject = d
      }
      let nearestSubject = Number.POSITIVE_INFINITY
      for (const s of textItems) {
        if (!nouns.has(s.name) || s.name === 'is') continue
        const d = Math.abs(s.x - is.x) + Math.abs(s.y - is.y)
        if (d < nearestSubject) nearestSubject = d
      }
      const cost = nearestObject + nearestSubject
      if (cost < best) best = cost
    }
    return best
  }
  if (queue.length === 0) {
    const hasYou = state.items.some((i) => i.props.includes('you'))
    const winCost = assembleCost('win')
    const youCost = hasYou ? 0 : assembleCost('you')
    return (
      (winCost === Number.POSITIVE_INFINITY ? cells : winCost) +
      (youCost === Number.POSITIVE_INFINITY ? cells : youCost)
    )
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

// Search nodes carry parent links instead of input strings: appending the
// whole path to every queued node costs O(depth) per edge and scales
// badly past depth ~50. The path is rebuilt once, when a goal pops.
type SearchNode = {
  state: GameState
  parent: SearchNode | null
  code: string
  depth: number
  score: number
}

const rootNode = (state: GameState): SearchNode => ({
  state,
  parent: null,
  code: '',
  depth: 0,
  score: 0,
})

const nodeInputs = (node: SearchNode): string => {
  const codes: string[] = []
  for (let n: SearchNode | null = node; n?.parent; n = n.parent)
    codes.push(n.code)
  return codes.reverse().join('')
}

type Frontier = {
  push: (node: SearchNode) => void
  pop: () => SearchNode | undefined
  readonly size: number
}

// BFS uses a plain index-advancing queue; greedy uses a binary min-heap
// on (score, insertion order) so equal ranks still come out FIFO.
const createFrontier = (strategy: SolveStrategy): Frontier => {
  if (strategy === 'bfs') {
    const queue: SearchNode[] = []
    let head = 0
    return {
      push: (node) => {
        queue.push(node)
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

  type Entry = { node: SearchNode; seq: number }
  const heap: Entry[] = []
  let seq = 0
  const less = (a: Entry, b: Entry): boolean =>
    a.node.score < b.node.score ||
    (a.node.score === b.node.score && a.seq < b.seq)
  const siftUp = (index: number): void => {
    while (index > 0) {
      const parent = (index - 1) >> 1
      const parentEntry = heap[parent]
      const entry = heap[index]
      if (!parentEntry || !entry || !less(entry, parentEntry)) return
      heap[parent] = entry
      heap[index] = parentEntry
      index = parent
    }
  }
  const siftDown = (index: number): void => {
    for (;;) {
      const left = index * 2 + 1
      const right = left + 1
      let smallest = index
      const leftEntry = heap[left]
      const rightEntry = heap[right]
      const smallestEntry = heap[smallest]
      if (leftEntry && smallestEntry && less(leftEntry, smallestEntry))
        smallest = left
      const currentSmallest = heap[smallest]
      if (rightEntry && currentSmallest && less(rightEntry, currentSmallest))
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
      heap.push({ node, seq })
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
      return top.node
    },
    get size() {
      return heap.length
    },
  }
}

// Scores only matter to the ranked strategies — bfs pops FIFO, so asking
// for a heuristic there would burn a grid scan per successor for nothing.
const scoreFor = (
  strategy: SolveStrategy,
  next: GameState,
  depth: number,
): number => {
  if (strategy === 'bfs') return 0
  const h = winDistance(next)
  if (strategy === 'greedy') return h
  if (strategy === 'wastar') return depth + 5 * h
  return depth + h
}

// Beam search keeps the frontier as a single sorted layer instead of a
// queue: everything at depth d is expanded, ranked, and truncated before
// depth d+1 starts.
const solveBeam = (initial: GameState, caps: SolveCaps): SolveResult => {
  const deadline = Date.now() + caps.deadlineMs
  const width = caps.beamWidth ?? 5000
  const visited = new Set<string>([stateKey(initial)])
  let layer: SearchNode[] = [rootNode(initial)]
  let expanded = 0

  for (let depth = 0; depth <= caps.maxDepth; depth += 1) {
    if (Date.now() > deadline)
      return { kind: 'cutoff', reason: 'timeout', expanded }
    const nextLayer: SearchNode[] = []
    for (const node of layer) {
      if (node.state.status === 'win') {
        return {
          kind: 'solved',
          inputs: nodeInputs(node),
          depth: node.depth,
          expanded,
          state: node.state,
        }
      }
      if (node.state.status === 'lose') continue
      expanded += 1
      const activity = boardActivity(node.state)
      if (!activity.hasYou && !activity.hasAuto && !activity.hasVirtualRules)
        continue
      const prepared = prepareStep(node.state)
      for (const action of ACTIONS) {
        if (
          action.direction === null &&
          !activity.hasAuto &&
          !activity.hasVirtualRules
        )
          continue
        const result =
          action.direction === null
            ? step(node.state, null)
            : prepared(action.direction)
        if (!result.changed) continue
        const next = result.state
        // Wins are terminal everywhere — surface them from the push side
        // instead of parking them in the frontier for a later pop.
        if (next.status === 'win') {
          return {
            kind: 'solved',
            inputs: nodeInputs(node) + action.code,
            depth: node.depth + 1,
            expanded,
            state: next,
          }
        }
        // A reached `lose` stays `lose` — dead states only churn keys.
        if (next.status === 'lose') continue
        const key = stateKey(next)
        if (visited.has(key)) continue
        visited.add(key)
        if (visited.size > caps.maxStates) {
          return { kind: 'cutoff', reason: 'states', expanded }
        }
        nextLayer.push({
          state: next,
          parent: node,
          code: action.code,
          depth: node.depth + 1,
          score: winDistance(next),
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
  if (strategy === 'macro') return solveMacro(initial, caps)
  const deadline = Date.now() + caps.deadlineMs
  const visited = new Set<string>([stateKey(initial)])
  const frontier = createFrontier(strategy)
  frontier.push(rootNode(initial))
  let expanded = 0

  for (;;) {
    const node = frontier.pop()
    if (!node) return { kind: 'exhausted', expanded }
    if ((expanded & 1023) === 0 && Date.now() > deadline) {
      return { kind: 'cutoff', reason: 'timeout', expanded }
    }
    if (node.depth > caps.maxDepth) {
      // BFS pops in depth order; the heap does not, so only the FIFO
      // frontier may treat this as a final cutoff.
      if (strategy === 'bfs') return { kind: 'cutoff', reason: 'depth', expanded }
      continue
    }
    const state = node.state
    if (state.status === 'win') {
      return {
        kind: 'solved',
        inputs: nodeInputs(node),
        depth: node.depth,
        expanded,
        state,
      }
    }
    if (state.status === 'lose') continue
    expanded += 1

    // Static board: nothing can move, wait, or rewire rules — every action
    // is a no-op, so expanding would just churn five step() calls.
    const activity = boardActivity(state)
    if (!activity.hasYou && !activity.hasAuto && !activity.hasVirtualRules)
      continue

    const prepared = prepareStep(state)
    for (const action of ACTIONS) {
      if (action.direction === null && !activity.hasAuto && !activity.hasVirtualRules)
        continue
      const result =
        action.direction === null ? step(state, null) : prepared(action.direction)
      if (!result.changed) continue
      const next = result.state
      if (next.status === 'win') {
        return {
          kind: 'solved',
          inputs: nodeInputs(node) + action.code,
          depth: node.depth + 1,
          expanded,
          state: next,
        }
      }
      if (next.status === 'lose') continue
      const key = stateKey(next)
      if (visited.has(key)) continue
      visited.add(key)
      if (visited.size > caps.maxStates) {
        return { kind: 'cutoff', reason: 'states', expanded }
      }
      frontier.push({
        state: next,
        parent: node,
        code: action.code,
        depth: node.depth + 1,
        score: scoreFor(strategy, next, node.depth + 1),
      })
    }
  }
}

// Waypoint-chasing BFS: expand toward a recorded layout instead of a win.
// Used by the golden re-solver, which turns one depth-300 blind search
// into a chain of shallow ones. `target` is matched by layout only —
// a mid-path `win` is still returned, since it ends the level outright
// and the caller's full replay decides whether the splice holds.
export const solveToLayout = (
  from: GameState,
  target: GameState,
  caps: SolveCaps,
): SolveResult => {
  const goal = layoutKey(target)
  if (layoutKey(from) === goal) {
    return { kind: 'solved', inputs: '', depth: 0, expanded: 0, state: from }
  }
  const deadline = Date.now() + caps.deadlineMs
  const visited = new Set<string>([layoutKey(from)])
  const queue: SearchNode[] = [rootNode(from)]
  let head = 0
  let expanded = 0

  while (head < queue.length) {
    const node = queue[head]
    head += 1
    if (!node) break
    if ((expanded & 1023) === 0 && Date.now() > deadline) {
      return { kind: 'cutoff', reason: 'timeout', expanded }
    }
    if (node.depth > caps.maxDepth) {
      return { kind: 'cutoff', reason: 'depth', expanded }
    }
    const state = node.state
    if (state.status === 'win') {
      return {
        kind: 'solved',
        inputs: nodeInputs(node),
        depth: node.depth,
        expanded,
        state,
      }
    }
    if (state.status === 'lose') continue
    expanded += 1

    const activity = boardActivity(state)
    if (!activity.hasYou && !activity.hasAuto && !activity.hasVirtualRules)
      continue

    const prepared = prepareStep(state)
    for (const action of ACTIONS) {
      if (action.direction === null && !activity.hasAuto && !activity.hasVirtualRules)
        continue
      const result =
        action.direction === null ? step(state, null) : prepared(action.direction)
      if (!result.changed) continue
      const next = result.state
      const key = layoutKey(next)
      if (key === goal || next.status === 'win') {
        return {
          kind: 'solved',
          inputs: nodeInputs(node) + action.code,
          depth: node.depth + 1,
          expanded,
          state: next,
        }
      }
      if (next.status === 'lose') continue
      if (visited.has(key)) continue
      visited.add(key)
      if (visited.size > caps.maxStates) {
        return { kind: 'cutoff', reason: 'states', expanded }
      }
      queue.push({
        state: next,
        parent: node,
        code: action.code,
        depth: node.depth + 1,
        score: 0,
      })
    }
  }
  return { kind: 'exhausted', expanded }
}

// ── Macro search ──────────────────────────────────────────────
// Sokoban-style decision granularity: one node is one *intent* — push
// unit u in direction d, pull it, walk onto a goal/effect cell, or wait.
// Free-space travel between intents is flooded per state, so a 60-cell
// corridor costs one node instead of sixty. Intermediate cells are still
// produced by step(), so nothing here assumes Sokoban movement — the
// flood only decides which positions are worth trying; anything it gets
// wrong is a wasted expansion, never an invalid replay.
const MACRO_DIRS: ReadonlyArray<{ code: string; dx: number; dy: number }> = [
  { code: 'u', dx: 0, dy: -1 },
  { code: 'd', dx: 0, dy: 1 },
  { code: 'l', dx: -1, dy: 0 },
  { code: 'r', dx: 1, dy: 0 },
]

const codeDirection = new Map<string, Direction | null>(
  ACTIONS.map((action) => [action.code, action.direction]),
)

// A unit carrying any of these makes its cell unenterable (wall, hazard,
// or something that takes an interaction step to resolve). `shut` is
// blocked by default — it becomes an endpoint only when a you carries
// `open`, since the pair then annihilates on contact.
const MACRO_BLOCK_PROPS = new Set([
  'stop',
  'push',
  'pull',
  'word',
  'still',
  'weak',
  'swap',
  'defeat',
  'sink',
  'hot',
  'melt',
  'boom',
  'shut',
])

// Free-standing cells worth ending a walk on.
const MACRO_GOAL_PROPS = new Set(['win', 'bonus', 'end', 'done', 'tele'])

// Flag values in the flood grid.
const CELL_FREE = 0
const CELL_BLOCKED = 1
const CELL_ENDPOINT = 2

// One macro = inputs + the state it produces. States are evaluated along
// the flood tree, so a path of length k costs one step() beyond its
// parent's already-computed state rather than k fresh calls per macro.
type MacroMove = {
  inputs: string
  state: GameState
  changed: boolean
}

const macroMoves = (state: GameState, activity: BoardActivity): MacroMove[] => {
  const { width, height } = state
  const cells = width * height
  const flags = new Uint8Array(cells)
  const cellItems: (Item[] | undefined)[] = new Array(cells)
  const youCells: number[] = []
  const pushables: Item[] = []
  const pullables: Item[] = []

  const youHasOpen = state.items.some(
    (item) => isYouLike(item) && item.props.includes('open'),
  )
  // `baba on flag is win`-style rules make bare cells positional goals —
  // the named unit's cell and its orthogonal neighbors are worth standing
  // on even when nothing there wins.
  const conditionNames = new Set<string>()
  for (const rule of state.rules) {
    const cond = rule.condition
    if (cond && 'object' in cond) conditionNames.add(cond.object)
  }

  for (const item of state.items) {
    const cell = item.y * width + item.x
    ;(cellItems[cell] ?? (cellItems[cell] = [])).push(item)
    if (isYouLike(item)) youCells.push(cell)
    if (item.isText || item.props.includes('push')) pushables.push(item)
    else if (item.props.includes('pull')) pullables.push(item)
  }

  // `empty is …` rules apply to unoccupied cells — they can turn voids
  // into walls (`empty is stop`) or goals (`empty is win`).
  const emptyProps = resolveActiveEmptyProps(
    state.rules,
    state.items,
    width,
    height,
  )
  const emptyBlocked = [...emptyProps].some((prop) =>
    MACRO_BLOCK_PROPS.has(prop),
  )
  const emptyGoal = [...emptyProps].some((prop) => MACRO_GOAL_PROPS.has(prop))

  const endpointCells: number[] = []
  const markEndpoint = (cell: number): void => {
    if (flags[cell] === CELL_FREE) {
      flags[cell] = CELL_ENDPOINT
      endpointCells.push(cell)
    }
  }

  for (let cell = 0; cell < cells; cell += 1) {
    const items = cellItems[cell]
    if (!items || items.length === 0) {
      if (emptyBlocked) flags[cell] = CELL_BLOCKED
      else if (emptyGoal) markEndpoint(cell)
      continue
    }
    for (const item of items) {
      if (item.isText) {
        flags[cell] = CELL_BLOCKED
        break
      }
      let blocked = false
      for (const prop of item.props) {
        if (prop === 'shut' && youHasOpen) {
          markEndpoint(cell)
          continue
        }
        if (MACRO_BLOCK_PROPS.has(prop)) {
          blocked = true
          break
        }
        if (MACRO_GOAL_PROPS.has(prop)) markEndpoint(cell)
      }
      if (blocked) {
        flags[cell] = CELL_BLOCKED
        break
      }
      if (conditionNames.has(item.name)) markEndpoint(cell)
    }
  }
  // Neighbors of condition-named units satisfy near/nextto/facedby-style
  // rules — worth standing on too.
  for (const cell of [...endpointCells]) {
    const items = cellItems[cell]
    if (!items?.some((item) => conditionNames.has(item.name))) continue
    const x = cell % width
    const y = (cell / width) | 0
    for (const dir of MACRO_DIRS) {
      const nx = x + dir.dx
      const ny = y + dir.dy
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
      markEndpoint(ny * width + nx)
    }
  }

  // Flood reachable free space from every you. Endpoints are recorded as
  // reachable (a walk can end there) but never expanded through.
  const parent = new Int32Array(cells).fill(-1)
  const parentDir = new Uint8Array(cells)
  const queue: number[] = []
  for (const cell of youCells) {
    if (parent[cell] === -1) {
      parent[cell] = cell
      queue.push(cell)
    }
  }
  for (let head = 0; head < queue.length; head += 1) {
    const cell = queue[head] as number
    const x = cell % width
    const y = (cell / width) | 0
    for (let d = 0; d < MACRO_DIRS.length; d += 1) {
      const dir = MACRO_DIRS[d] as { code: string; dx: number; dy: number }
      const nx = x + dir.dx
      const ny = y + dir.dy
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
      const ncell = ny * width + nx
      if (flags[ncell] === CELL_BLOCKED || parent[ncell] !== -1) continue
      parent[ncell] = cell
      parentDir[ncell] = d
      if (flags[ncell] === CELL_FREE) queue.push(ncell)
    }
  }

  // Lazily evaluated "state after walking to cell c": each cell costs one
  // step() past its parent's state, and shared path prefixes are computed
  // once. `changed` accumulates so a macro whose every step was a no-op
  // is detectable without replaying anything.
  const stateAt: (GameState | undefined)[] = new Array(cells)
  const changedAt = new Uint8Array(cells)
  const computing = new Uint8Array(cells)
  const arrive = (cell: number): GameState => {
    const cached = stateAt[cell]
    if (cached) return cached
    if (computing[cell]) return state
    computing[cell] = 1
    const prev = parent[cell] as number
    if (prev === -1 || prev === cell) {
      stateAt[cell] = state
      changedAt[cell] = 0
    } else {
      const before = arrive(prev)
      const dir = MACRO_DIRS[parentDir[cell] as number] as (typeof MACRO_DIRS)[number]
      const result = step(before, codeDirection.get(dir.code) ?? null)
      stateAt[cell] = result.state
      changedAt[cell] = changedAt[prev] || result.changed ? 1 : 0
    }
    computing[cell] = 0
    return stateAt[cell] as GameState
  }

  const moves: MacroMove[] = []
  const seen = new Set<string>()
  const add = (inputs: string, end: GameState, changed: boolean): void => {
    if (inputs.length > 0 && !seen.has(inputs)) {
      seen.add(inputs)
      moves.push({ inputs, state: end, changed })
    }
  }

  const pathTo = (cell: number): string => {
    let out = ''
    let cur = cell
    for (;;) {
      const prev = parent[cur] as number
      if (prev === -1 || prev === cur) break
      out = (MACRO_DIRS[parentDir[cur] as number] as { code: string }).code + out
      cur = prev
    }
    return out
  }

  for (const cell of endpointCells) {
    if (parent[cell] !== -1) {
      add(pathTo(cell), arrive(cell), changedAt[cell] === 1)
    }
  }
  // Push: stand on the far side, step toward the unit.
  // Pull: stand one step past the unit, step away — the pullable at the
  // mover's back follows into the vacated cell.
  for (const [units, sign] of [
    [pushables, -1],
    [pullables, 1],
  ] as const) {
    for (const item of units) {
      for (const dir of MACRO_DIRS) {
        const sx = item.x + sign * dir.dx
        const sy = item.y + sign * dir.dy
        if (sx < 0 || sy < 0 || sx >= width || sy >= height) continue
        const stand = sy * width + sx
        if (parent[stand] === -1) continue
        const before = arrive(stand)
        const pushed = step(before, codeDirection.get(dir.code) ?? null)
        add(
          pathTo(stand) + dir.code,
          pushed.state,
          changedAt[stand] === 1 || pushed.changed,
        )
      }
    }
  }
  if (activity.hasAuto || activity.hasVirtualRules) {
    const waited = step(state, null)
    add('w', waited.state, waited.changed)
  }
  // Degenerate boards (no reachable anything) still get raw nudges so the
  // search never goes silently dry on exotic rule sets.
  if (moves.length === 0) {
    for (const dir of MACRO_DIRS) {
      const result = step(state, codeDirection.get(dir.code) ?? null)
      add(dir.code, result.state, result.changed)
    }
  }
  return moves
}

const solveMacro = (initial: GameState, caps: SolveCaps): SolveResult => {
  const deadline = Date.now() + caps.deadlineMs
  const visited = new Set<string>([stateKey(initial)])
  // Greedy ranking: macro nodes already skip the travel, so ordering by
  // wall-aware win distance chases progress instead of breadth order.
  const frontier = createFrontier('greedy')
  frontier.push(rootNode(initial))
  let expanded = 0

  for (;;) {
    const node = frontier.pop()
    if (!node) return { kind: 'exhausted', expanded }
    if ((expanded & 1023) === 0 && Date.now() > deadline) {
      return { kind: 'cutoff', reason: 'timeout', expanded }
    }
    if (node.depth > caps.maxDepth) continue
    const state = node.state
    if (state.status === 'win') {
      const inputs = nodeInputs(node)
      return { kind: 'solved', inputs, depth: inputs.length, expanded, state }
    }
    if (state.status === 'lose') continue
    expanded += 1

    const activity = boardActivity(state)
    if (!activity.hasYou && !activity.hasAuto && !activity.hasVirtualRules)
      continue

    // Distinct macros regularly land on the same board (walks ending at
    // neighboring cells, pushes that leave the layout untouched) — dedupe
    // per expansion so each unique successor is queued and scored once.
    const localKeys = new Set<string>()
    for (const macro of macroMoves(state, activity)) {
      if (!macro.changed) continue
      const next = macro.state
      if (next.status === 'win') {
        const solved = nodeInputs(node) + macro.inputs
        return {
          kind: 'solved',
          inputs: solved,
          depth: solved.length,
          expanded,
          state: next,
        }
      }
      if (next.status === 'lose') continue
      const key = stateKey(next)
      if (visited.has(key) || !localKeys.add(key)) continue
      visited.add(key)
      if (visited.size > caps.maxStates) {
        return { kind: 'cutoff', reason: 'states', expanded }
      }
      frontier.push({
        state: next,
        parent: node,
        code: macro.inputs,
        depth: node.depth + 1,
        score: winDistance(next),
      })
    }
  }
}

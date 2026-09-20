import {
  emptyLockHit,
  emptyWeakHit,
  getLiveCellItems,
  inBounds,
  isLockedFor,
  isLockCollision,
  LOCKED_PROPS,
  moveOne,
  removeOne,
} from './move-core.js'
import { hasProp, keyFor, MOVE_DELTAS } from './shared.js'

import type { MoveCoreContext } from './move-core.js'
import type { Direction, Item } from '../types.js'

export type SingleMoveContext = MoveCoreContext & {
  // Per-cell `empty is <prop>` resolution: every empty cell is its own
  // pseudo-unit (official unitid 2), so conditional rules like
  // `empty near water is push` only apply where the condition holds.
  emptyPropsAt: (x: number, y: number) => ReadonlySet<string>
  moved: Set<number>
  moverIds: Set<number>
  status: { anyMoved: boolean }
  swapIds: Set<number>
}

export const createSingleMoveRuntime = (
  context: SingleMoveContext,
  direction: Direction,
  isMovePhase: boolean,
  // Official `fallblock` drives the same `check` but treats every
  // nonzero obstacle verdict as ground — a faller lands on pushable,
  // pullable and swap units instead of displacing them. Only consumed
  // specials (lock/eat/same-layer `weak`) and soft objects let a fall
  // continue.
  fallMode = false,
): {
  canMove: (id: number, visiting: Set<number>) => boolean
  canMoveRoot: (id: number) => boolean
  doMove: (id: number) => void
} => {
  const [dx, dy] = MOVE_DELTAS[direction]

  // Official `canmove` empty branch: `still`/`locked<dir>` cancels
  // `swap` first; a cell with no remaining push/swap is enterable unless
  // `stop`/`pull` walls it off, while a still `push`/`swap` empty can't
  // be displaced and blocks outright.
  const emptyBlocked = (x: number, y: number): boolean => {
    const props = context.emptyPropsAt(x, y)
    const estill = props.has('still') || props.has(LOCKED_PROPS[direction])
    const eswap = props.has('swap') && !estill
    if (!props.has('push') && !eswap)
      return props.has('pull') || props.has('stop')
    return estill
  }

  // A pushable empty forwards the push: the chain ends on the first
  // non-push empty (the pushed emptiness lands there), on real units
  // (which become the push targets), or on the board edge (blocked).
  const emptyForwardsPush = (x: number, y: number): boolean => {
    const props = context.emptyPropsAt(x, y)
    return (
      props.has('push') &&
      !props.has('swap') &&
      !props.has('still') &&
      !props.has(LOCKED_PROPS[direction])
    )
  }

  const isMoveEntity = (id: number): boolean =>
    isMovePhase && context.moverIds.has(id)

  // The official engine resolves a whole push chain against the frozen
  // board: each pushed unit's `check` sees its target cell as it was at
  // the start of the chain — a companion already queued out of the shared
  // cell is not yet at the destination. We apply moves eagerly instead, so
  // a unit that landed at the queried cell during THIS root push must be
  // skipped. In a direction-locked phase any such unit arrived from the
  // querying unit's own cell (a stacked companion); units displaced by
  // earlier root pushes carry an older wave tag and still block normally.
  const liveForward = (x: number, y: number): Item[] =>
    getLiveCellItems(context, x, y).filter(
      (target) => context.movedWave.get(target.id) !== context.moveWave,
    )

  let waveDepth = 0
  // Official `addaction` resolves pulled units breadth-first: every pull
  // target in the vacated cell updates before any of them drags the cell
  // behind IT. Queue pulls and drain them at the root so a pulled unit's
  // own pull never runs ahead of its siblings' moves.
  const pullQueue: number[] = []
  const queuePulls = (targets: Item[]): void => {
    for (const target of targets) {
      if (context.moved.has(target.id) || context.removed.has(target.id))
        continue
      pullQueue.push(target.id)
    }
  }

  // Root-level `canMove` checks each want a fresh visiting set; one scratch
  // set cleared per call replaces the per-call allocation (the recursion
  // is synchronous, so sharing is safe).
  const visitingScratch = new Set<number>()
  const canMoveRoot = (id: number): boolean => {
    if (waveDepth === 0) context.moveWave++
    visitingScratch.clear()
    return canMove(id, visitingScratch)
  }

  const canMove = (id: number, visiting: Set<number>): boolean => {
    if (visiting.has(id)) return true
    visiting.add(id)

    const item = context.byId.get(id)
    if (!item) return false
    if (isLockedFor(item, direction)) return false

    const nx = item.x + dx
    const ny = item.y + dy
    if (!inBounds(context, nx, ny)) return false

    let throughEmptyPush = false
    let targets = liveForward(nx, ny)
    if (!targets.length) {
      // `x eat empty` frees the cell outright (official `valid=false`
      // skips the whole empty-block verdict).
      if (context.eatsEmpty(item, nx, ny)) return true
      const emptyProps = context.emptyPropsAt(nx, ny)
      // Official empty-branch specials: an open/shut mover meeting the
      // cell's partner prop annihilates on entry, and `empty is weak`
      // crumbles — the empty pseudo-unit dies (dropping `empty has x`)
      // instead of blocking. An unsafe lock mover dies at doMove.
      if (
        emptyLockHit(context, item, emptyProps) ||
        emptyWeakHit(item, emptyProps)
      )
        return true
      // Swapping with an empty is a plain step in; a pushable empty
      // forwards the push until the chain lands somewhere.
      if (emptyProps.has('swap') && !emptyBlocked(nx, ny))
        return true
      if (emptyBlocked(nx, ny)) return false

      let lookX = nx
      let lookY = ny
      while (emptyForwardsPush(lookX, lookY)) {
        lookX += dx
        lookY += dy
        if (!inBounds(context, lookX, lookY)) return false
        targets = liveForward(lookX, lookY)
        if (targets.length) {
          throughEmptyPush = true
          break
        }
        if (emptyBlocked(lookX, lookY)) return false
      }
    }

    const pushTargets: Item[] = []
    // `x is swap` works both ways: the mover itself carrying swap trades
    // places with whatever it walks into. Officially every obstacle
    // contributes result 0 for a swap mover — nothing blocks it; `still`
    // targets simply stay behind (no swap, no block).
    const moverSwap = !throughEmptyPush && context.swapIds.has(item.id)
    for (const target of targets) {
      // Phantom units are ghosts for collision purposes — movers pass
      // through them with no push/pull/stop interaction at all.
      if (context.phantomIds.has(target.id)) continue
      const sameLayer =
        hasProp(item, 'float') === hasProp(target, 'float')
      // Official special order: `lock` (open/shut) then `eat` — both set
      // `valid=false`, so a consumed target never blocks, not even with
      // `stop`/`pull`/`still`. Removal happens in `doMove` on success.
      if (
        !throughEmptyPush &&
        isLockCollision(context, item, target)
      )
        continue
      if (context.eats(item, target)) continue

      // `weak` on the same float layer never counts as a solid blocker
      // (it dies on contact instead), but `weak`+`push` still pushes —
      // the official guard only skips the result-1 branch.
      const weakShatters = context.weakIds.has(target.id) && sameLayer

      // `fallblock`: the falling unit lands on ANY nonzero obstacle —
      // pushable/pullable/swappable all count — and only continues
      // through soft objects and consumed specials (lock/eat above,
      // same-layer weak here).
      if (fallMode) {
        if (weakShatters) continue
        const blocksFall =
          context.stopIds.has(target.id) ||
          context.pushIds.has(target.id) ||
          context.pullIds.has(target.id) ||
          context.swapIds.has(target.id) ||
          ((context.stillIds.has(target.id) ||
            isLockedFor(target, direction)) &&
            (hasProp(target, 'push') || hasProp(target, 'pull')))
        if (blocksFall) return false
        continue
      }

      if (moverSwap) continue

      // Official `cantmove` on the target (still / level-hold pin /
      // locked<dir>) nils `push` and `pull` into `stop` and cancels
      // `swap` — a bare `still` unit does not block entry at all.
      const cantMove =
        context.stillIds.has(target.id) ||
        isLockedFor(target, direction)
      const swappable =
        context.swapIds.has(target.id) && !cantMove
      const pullable =
        context.pullIds.has(target.id) && !cantMove && !swappable
      // Official gates the push branch on `isswap == nil`: a swap-prop
      // target is never pushed — it trades into the mover's origin cell
      // instead (the `swaps` list in check()).
      const pushable =
        context.pushIds.has(target.id) && !cantMove && !swappable
      const stopLike =
        context.stopIds.has(target.id) ||
        (cantMove &&
          (hasProp(target, 'push') || hasProp(target, 'pull')))
      if (
        !swappable &&
        !pushable &&
        (stopLike || pullable) &&
        !weakShatters
      ) {
        // A blocker that is itself a mover this phase (e.g. WALL IS YOU
        // plus WALL IS STOP) only blocks if it cannot vacate its cell —
        // the predecessor defers to the blocker's own pending arrow.
        if (context.moverIds.has(target.id)) {
          if (!canMove(target.id, visiting)) return false
          continue
        }
        return false
      }
      if (pushable) pushTargets.push(target)
    }

    for (const target of pushTargets) {
      if (canMove(target.id, visiting)) continue
      if (context.weakIds.has(target.id) && !isMoveEntity(target.id)) continue
      return false
    }

    return true
  }

  const doMoveInner = (id: number): void => {
    if (context.moved.has(id) || context.removed.has(id)) return

    const item = context.byId.get(id)
    if (!item) return

    const oldX = item.x
    const oldY = item.y
    const nx = item.x + dx
    const ny = item.y + dy

    let throughEmptyPush = false
    let frontTargets = liveForward(nx, ny)
    const frontCellEmpty = !frontTargets.length
    if (!frontTargets.length) {
      let lookX = nx
      let lookY = ny
      while (emptyForwardsPush(lookX, lookY)) {
        lookX += dx
        lookY += dy
        if (!inBounds(context, lookX, lookY)) break
        frontTargets = liveForward(lookX, lookY)
        if (frontTargets.length) {
          throughEmptyPush = true
          break
        }
      }
    }

    const moverSwap = !throughEmptyPush && context.swapIds.has(item.id)
    // Eaten and unlocked targets contribute result 0 — they are consumed
    // where they stand, never pushed onward.
    const pushTargets = moverSwap
      ? []
      : frontTargets.filter(
          (target) =>
            context.pushIds.has(target.id) &&
            !context.swapIds.has(target.id) &&
            !context.eats(item, target) &&
            !isLockCollision(context, item, target),
        )
    const swapTargets =
      throughEmptyPush || fallMode
        ? []
        : frontTargets.filter(
            (target) =>
              !context.phantomIds.has(target.id) &&
              !context.weakIds.has(target.id) &&
              !context.eats(item, target) &&
              !isLockCollision(context, item, target) &&
              (moverSwap
                ? !context.stillIds.has(target.id)
                : context.swapIds.has(target.id)),
          )

    const behindX = oldX - dx
    const behindY = oldY - dy
    // A faller never drags `pull` cargo — `fallblock` only ever moves the
    // falling unit itself.
    const pullTargets = fallMode
      ? []
      : getLiveCellItems(context, behindX, behindY).filter((target) =>
          context.pullIds.has(target.id),
        )

    for (const target of pushTargets) {
      if (context.moved.has(target.id) || context.removed.has(target.id))
        continue
      if (!canMoveRoot(target.id)) {
        if (context.weakIds.has(target.id) && !isMoveEntity(target.id))
          if (removeOne(context, target)) context.status.anyMoved = true

        continue
      }
      doMove(target.id)
    }

    // Empty-branch specials at the landing cell (official check()): the
    // empty pseudo-unit dies for `x eat empty`, a lock pair, or
    // `empty is weak` — and an unsafe lock mover dies at its own cell
    // without moving (`gone` skips the update).
    if (frontCellEmpty) {
      const emptyProps = context.emptyPropsAt(nx, ny)
      const lockHit = emptyLockHit(context, item, emptyProps)
      if (
        context.eatsEmpty(item, nx, ny) ||
        lockHit ||
        emptyWeakHit(item, emptyProps)
      )
        context.deadEmptyCells.add(keyFor(nx, ny, context.width))
      if (lockHit && removeOne(context, item)) {
        context.moved.add(item.id)
        context.status.anyMoved = true
        queuePulls(pullTargets)
        return
      }
    }

    const openShutTargets = throughEmptyPush
      ? []
      : getLiveCellItems(context, nx, ny).filter((target) =>
          isLockCollision(context, item, target),
        )

    if (openShutTargets.length) {
      // Official lock: an unsafe mover dies at its origin (`gone` skips
      // the position update); a `safe` mover survives and still lands.
      if (removeOne(context, item)) {
        context.moved.add(item.id)
        context.status.anyMoved = true
      } else if (moveOne(context, item, nx, ny)) {
        context.moved.add(item.id)
        context.status.anyMoved = true
      }

      for (const target of openShutTargets)
        if (removeOne(context, target)) context.status.anyMoved = true

      queuePulls(pullTargets)

      return
    }

    if (item.dir !== direction) item.dir = direction
    if (moveOne(context, item, nx, ny)) {
      context.moved.add(item.id)
      context.status.anyMoved = true

      // `x eat y` specials: whatever the mover stepped onto is consumed.
      // `fallblock` additionally shatters same-layer `weak` units on every
      // cell the faller passes through or lands on — they die mid-fall,
      // before the interaction phase could ever see the overlap.
      for (const target of getLiveCellItems(context, nx, ny)) {
        if (target.id === item.id) continue
        const weakVictim =
          fallMode &&
          context.weakIds.has(target.id) &&
          hasProp(item, 'float') === hasProp(target, 'float')
        if (!context.eats(item, target) && !weakVictim) continue
        if (removeOne(context, target)) context.status.anyMoved = true
      }
    }

    for (const target of swapTargets) {
      if (context.moved.has(target.id) || context.removed.has(target.id))
        continue
      const targetLive = context.byId.get(target.id)
      if (!targetLive) continue
      if (moveOne(context, targetLive, oldX, oldY)) {
        context.moved.add(targetLive.id)
        context.status.anyMoved = true
      }
    }

    queuePulls(pullTargets)
  }

  // The wave tag spans one whole root push (nested pushes, pulls and
  // swaps included) — matching the official frozen-board resolution.
  const doMove = (id: number): void => {
    const root = waveDepth === 0
    if (root) context.moveWave++
    waveDepth++
    try {
      doMoveInner(id)
      if (!root) return
      // Breadth-first drain: each pulled unit's own pull chain enqueues
      // behind its siblings, matching the official addaction queue.
      for (let i = 0; i < pullQueue.length; i++) {
        const pid = pullQueue[i]!
        if (context.moved.has(pid) || context.removed.has(pid)) continue
        if (!canMoveRoot(pid)) continue
        doMoveInner(pid)
      }
    } finally {
      waveDepth--
      if (root) pullQueue.length = 0
    }
  }

  return { canMove, canMoveRoot, doMove }
}

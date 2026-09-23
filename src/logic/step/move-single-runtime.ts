import {
  emptyLockHit,
  emptyPullRootBlocked,
  emptyWeakHit,
  getLiveCellItems,
  inBounds,
  isLockedFor,
  isLockCollision,
  LOCKED_PROPS,
  moveOne,
  removeOne,
  traceEmptyPullCargo,
} from './move-core.js'
import { hasLatchedFloat, hasProp, keyFor, MOVE_DELTAS } from './shared.js'

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
  drainSpecials: () => boolean
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

  // The official engine resolves a whole take iteration against the
  // frozen board: queued moves only apply when the iteration's movelist
  // drains, so a unit displaced during THIS pass still occupies its
  // origin cell for every later check — and the cell it lands in does
  // not count it yet. We apply moves eagerly instead: skip this-pass
  // arrivals at the queried cell and re-include this-pass departures.
  const liveForward = (x: number, y: number): Item[] => {
    const occupants = getLiveCellItems(context, x, y).filter(
      (target) => !context.passMoved.has(target.id),
    )
    const departed = context.passDeparted.get(keyFor(x, y, context.width))
    if (departed === undefined) return occupants
    for (const target of departed) {
      if (
        context.passMoved.has(target.id) &&
        !context.removed.has(target.id)
      )
        occupants.push(target)
    }
    return occupants
  }

  // A pulled unit resolves its landing cell with the puller exempt —
  // officially `pulling and (hms[i] ~= pusherid)` contributes result 0:
  // the puller is still physically present until the movelist drains but
  // never blocks, pushes, or swaps with its cargo. The flag is consumed
  // by the entry's own front-cell evaluation; nested checks see null.
  let pullExempt: number | null = null

  // Official `move()` specials defer to the movelist drain: a `lock` or
  // `eat` special is dodged entirely when its target already left the
  // impact cell or holds any queued move entry — so a same-direction
  // chain lets the leader escape instead of annihilating. We resolve
  // eagerly instead: specials are recorded at landing and fired when the
  // pass drains (end of the fixpoint iteration), skipped whenever the
  // target actually moved. `weak` specials never dodge — they stay
  // immediate. If a lock does fire, the unsafe mover dies at its ORIGIN
  // (`gone` skipped the position update), so the has-drop lands there.
  const deferredSpecials: Array<{
    moverId: number
    targetId: number
    x: number
    y: number
    originX: number
    originY: number
    kind: 'lock' | 'eat'
  }> = []

  const drainSpecials = (): boolean => {
    let fired = false
    for (const spec of deferredSpecials) {
      const target = context.byId.get(spec.targetId)
      if (
        target === undefined ||
        context.removed.has(spec.targetId) ||
        context.passMoved.has(spec.targetId) ||
        target.x !== spec.x ||
        target.y !== spec.y
      )
        continue
      if (spec.kind === 'eat') {
        if (removeOne(context, target)) {
          context.status.anyMoved = true
          fired = true
        }
        continue
      }
      // Officially `gone` skips the pair's later specials — once the
      // mover is dead (by this pair or anything else) its remaining
      // queued locks never fire.
      if (context.removed.has(spec.moverId)) continue
      if (removeOne(context, target)) {
        context.status.anyMoved = true
        fired = true
      }
      const mover = context.byId.get(spec.moverId)
      if (mover !== undefined) {
        // The mover tentatively landed when the special was queued;
        // roll it back to the origin cell so its death (and has-drop)
        // happens where the official `gone` path leaves it.
        if (mover.x !== spec.originX || mover.y !== spec.originY)
          moveOne(context, mover, spec.originX, spec.originY)
        if (removeOne(context, mover)) {
          context.moved.add(spec.moverId)
          context.status.anyMoved = true
        }
      }
    }
    deferredSpecials.length = 0
    return fired
  }

  let waveDepth = 0
  // Official `addaction` resolves pulled units breadth-first: every pull
  // target in the vacated cell updates before any of them drags the cell
  // behind IT. Queue pulls and drain them at the root so a pulled unit's
  // own pull never runs ahead of its siblings' moves. Only the root
  // mover's direct pull targets are `gated` — officially they pass a
  // `trypush`/`dopush` destination check — while cargo queued by pushed
  // or already-pulled units is appended unconditionally.
  const pullQueue: Array<{
    id: number
    pullerId: number
    gated: boolean
  }> = []
  const queuePulls = (
    targets: Item[],
    pullerId: number,
    gated: boolean,
  ): void => {
    for (const target of targets) {
      if (context.moved.has(target.id) || context.removed.has(target.id))
        continue
      pullQueue.push({ id: target.id, pullerId, gated })
    }
  }

  // Pass-0 root checks defer push resolution (official state-0 → state-1
  // transition); nested checks inside `doMove` (waveDepth > 0) are the
  // dopush path and push freely.
  const deferPushThisPass = (): boolean =>
    context.movePass === 0 && waveDepth === 0

  // Root-level `canMove` checks each want a fresh visiting set; one scratch
  // set cleared per call replaces the per-call allocation (the recursion
  // is synchronous, so sharing is safe). `checkRootId` attributes a nested
  // deferral back to the take-mover being evaluated.
  const visitingScratch = new Set<number>()
  let checkRootId = -1
  const canMoveRoot = (id: number): boolean => {
    visitingScratch.clear()
    checkRootId = id
    return canMove(id, visitingScratch)
  }

  // Frozen pass-start position: a unit that already departed this pass
  // is officially still at its origin for every later check — a re-queued
  // push evaluates and lands from there, not from its live cell.
  const frozenX = (item: Item): number => {
    const key = context.passOrigins.get(item.id)
    return key === undefined ? item.x : key % context.width
  }
  const frozenY = (item: Item): number => {
    const key = context.passOrigins.get(item.id)
    return key === undefined ? item.y : (key - (key % context.width)) / context.width
  }

  const canMove = (id: number, visiting: Set<number>): boolean => {
    if (visiting.has(id)) return true
    visiting.add(id)

    const item = context.byId.get(id)
    if (!item) return false
    if (isLockedFor(item, direction)) return false

    const nx = frozenX(item) + dx
    const ny = frozenY(item) + dy
    if (!inBounds(context, nx, ny)) return false

    let throughEmptyPush = false
    let targets = liveForward(nx, ny)
    // Consume the puller exemption: it applies only to this unit's own
    // front cell, where the departed puller still counts as present but
    // never obstructs its cargo.
    const exemptId = pullExempt
    pullExempt = null
    const exemptHere =
      exemptId !== null &&
      targets.some((target) => target.id === exemptId)
    if (exemptHere)
      targets = targets.filter((target) => target.id !== exemptId)
    if (!targets.length) {
      // The cell officially still holds the puller — free to enter, with
      // no empty-pseudo verdict attached.
      if (exemptHere) return true
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
        hasLatchedFloat(item) === hasLatchedFloat(target)
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
      )
        // The board is frozen for the whole pass — a blocker that is
        // itself a mover still occupies the cell until the drain, so it
        // always blocks; a trailing mover follows on a later pass.
        return false
      if (pushable) pushTargets.push(target)
    }

    // Officially a take-mover whose check meets a pushable obstacle does
    // NOT resolve the push in its first (state-0) pass — it advances
    // state and retries next iteration, so its movelist entry lands in
    // a later drain and same-pass specials against it cannot dodge.
    // Only root take-movers defer: nested resolution (push chains,
    // gated pulls inside `doMove`) is the official dopush path, which
    // pushes freely at any state.
    if (deferPushThisPass() && pushTargets.length) {
      context.deferredIds.add(checkRootId)
      return false
    }

    for (const target of pushTargets) {
      if (canMove(target.id, visiting)) continue
      if (context.weakIds.has(target.id) && !isMoveEntity(target.id)) continue
      return false
    }

    return true
  }

  const doMoveInner = (id: number, isWaveRoot: boolean): void => {
    const item = context.byId.get(id)
    if (!item) return
    // A killed mover's `moving_units` entry keeps processing its state
    // machine on the stale position: its push/pull/swap side-effects
    // still resolve (official dopush), but the corpse never lands and
    // its queued specials are inert at drain (`unit.flags[DEAD]`).
    const deadMover = context.removed.has(id)

    // Re-queued units resolve from their frozen pass-start cell —
    // officially the second movelist entry teleports them to
    // queuedOrigin + dir, wherever they actually sit now.
    const oldX = frozenX(item)
    const oldY = frozenY(item)
    const nx = oldX + dx
    const ny = oldY + dy

    let throughEmptyPush = false
    let frontTargets = liveForward(nx, ny)
    const exemptId = pullExempt
    pullExempt = null
    const exemptHere =
      exemptId !== null &&
      frontTargets.some((target) => target.id === exemptId)
    if (exemptHere)
      frontTargets = frontTargets.filter(
        (target) => target.id !== exemptId,
      )
    // The vacated puller still occupies the cell officially — the landing
    // is not an empty cell, so no empty-pseudo specials apply.
    const frontCellEmpty = !frontTargets.length && !exemptHere
    if (frontCellEmpty) {
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
      : liveForward(behindX, behindY).filter((target) =>
          context.pullIds.has(target.id),
        )
    // `empty is pull` (official check() returns pseudo-unit 2 for a
    // pullable unit-free cell): the dragged empty pulls the cell behind
    // IT, propagating through consecutive pull-empties until real cargo.
    // The chain resolves only when the root empty's landing cell — the
    // mover's own — holds no vetoing co-occupant; the cargo itself is a
    // nested pull and lands unconditionally.
    const emptyPullTargets = fallMode
      ? []
      : emptyPullRootBlocked(context, liveForward, item, direction)
        ? []
        : traceEmptyPullCargo(
            context,
            liveForward,
            behindX,
            behindY,
            direction,
          )
    const queueAllPulls = (): void => {
      queuePulls(pullTargets, item.id, isWaveRoot)
      queuePulls(emptyPullTargets, item.id, false)
    }

    for (const target of pushTargets) {
      if (context.removed.has(target.id)) continue
      // Official `pushedunits` dedup keys (pusher origin cell, unit): a
      // unit can be queued once per pusher cell per pass — pushed twice
      // by two chains, both entries apply in drain order.
      const qkey = `${keyFor(oldX, oldY, context.width)}:${target.id}`
      if (context.pushQueued.has(qkey)) continue
      context.pushQueued.add(qkey)
      if (!canMoveRoot(target.id)) {
        if (context.weakIds.has(target.id) && !isMoveEntity(target.id))
          if (removeOne(context, target)) context.status.anyMoved = true

        continue
      }
      doMove(target.id)
    }

    if (deadMover) {
      // The corpse's own move is inert — but its queued swap teleports
      // and pull cargo still resolve, like the official dopush running
      // inside a dead mover's check.
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
      queueAllPulls()
      context.moved.add(id)
      return
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
        queueAllPulls()
        return
      }
    }

    const openShutTargets = throughEmptyPush
      ? []
      : liveForward(nx, ny).filter(
          (target) =>
            target.id !== exemptId &&
            isLockCollision(context, item, target),
        )

    if (openShutTargets.length) {
      // Lock specials defer to the pass drain — the pair annihilates
      // only if the target never actually moves this pass.
      for (const target of openShutTargets)
        deferredSpecials.push({
          moverId: item.id,
          targetId: target.id,
          x: nx,
          y: ny,
          originX: oldX,
          originY: oldY,
          kind: 'lock',
        })
      if (moveOne(context, item, nx, ny)) {
        context.moved.add(item.id)
        context.status.anyMoved = true
      }

      queueAllPulls()

      return
    }

    // `fallblock` lands via `update(unitid,x,y)` — no facing write; every
    // other move path turns the unit toward its travel direction.
    if (!fallMode && item.dir !== direction) item.dir = direction
    if (moveOne(context, item, nx, ny)) {
      context.moved.add(item.id)
      context.status.anyMoved = true

      // `x eat y` specials: whatever the mover stepped onto is consumed
      // — deferred like locks, so a target that still vacates this pass
      // dodges the bite. `fallblock` additionally shatters same-layer
      // `weak` units on every cell the faller passes through or lands
      // on — those die mid-fall immediately, before the interaction
      // phase could ever see the overlap.
      for (const target of liveForward(nx, ny)) {
        if (target.id === item.id || target.id === exemptId) continue
        const weakVictim =
          fallMode &&
          context.weakIds.has(target.id) &&
          hasLatchedFloat(item) === hasLatchedFloat(target)
        if (weakVictim) {
          if (removeOne(context, target)) context.status.anyMoved = true
          continue
        }
        if (!context.eats(item, target)) continue
        deferredSpecials.push({
          moverId: item.id,
          targetId: target.id,
          x: nx,
          y: ny,
          originX: oldX,
          originY: oldY,
          kind: 'eat',
        })
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

    queueAllPulls()
  }

  // The wave tag spans one whole root push (nested pushes, pulls and
  // swaps included) — matching the official frozen-board resolution.
  const doMove = (id: number): void => {
    const root = waveDepth === 0
    waveDepth++
    try {
      doMoveInner(id, root)
      if (!root) return
      // Breadth-first drain: each pulled unit's own pull chain enqueues
      // behind its siblings, matching the official addaction queue. The
      // root mover's direct pull targets still verify the landing cell
      // (official `trypush`); nested cargo lands unconditionally —
      // officially it is queued before its own dopush resolves, so a
      // failed push there only leaves the pushed unit behind.
      for (let i = 0; i < pullQueue.length; i++) {
        const entry = pullQueue[i]!
        if (context.moved.has(entry.id) || context.removed.has(entry.id))
          continue
        if (entry.gated) {
          pullExempt = entry.pullerId
          visitingScratch.clear()
          const clear = canMove(entry.id, visitingScratch)
          pullExempt = null
          if (!clear) continue
        }
        pullExempt = entry.pullerId
        doMoveInner(entry.id, false)
        pullExempt = null
      }
    } finally {
      waveDepth--
      if (root) pullQueue.length = 0
    }
  }

  return { canMove, canMoveRoot, doMove, drainSpecials }
}

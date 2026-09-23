import {
  emptyLockHit,
  emptyPullRootBlocked,
  emptyWeakHit,
  getLiveCellItems,
  inBounds,
  isLockedFor,
  isLockCollision,
  LOCKED_PROPS,
  removeOne,
  traceEmptyPullCargo,
} from './move-core.js'
import { hasLatchedFloat, hasProp, MOVE_DELTAS, reverseDirection } from './shared.js'

import type { MoveCoreContext } from './move-core.js'
import type { Direction } from '../types.js'

type ArrowStatus = 'pending' | 'moving' | 'stopped'

export type Arrow = {
  dir: Direction
  // The arrow needed more than the first check — its push target had to
  // resolve first, a swap target was pending, or it bounced. Officially
  // such a mover exits the pass with `state > 0`, so its still_moving
  // re-entry runs at state 10: pushes still apply but the move/chill
  // flip-retry is skipped.
  escalated: boolean
  flipped: boolean
  isMove: boolean
  // Officially `reason == "shift"`: belts get a wider already-moving
  // dodge in check() — a target queued to move anywhere that isn't the
  // mover's own cell is transparent to the rider.
  isShift: boolean
  status: ArrowStatus
}

export type BatchMoveContext = MoveCoreContext & {
  // Per-cell `empty is <prop>` resolution: every empty cell is its own
  // pseudo-unit (official unitid 2), so conditional rules like
  // `empty near water is push` only apply where the condition holds.
  emptyPropsAt: (x: number, y: number) => ReadonlySet<string>
  // `level is hold`-pinned units: can't move under their own power.
  pinnedIds: Set<number>
  status: { changed: boolean }
  // Movers carrying `swap` trade places with the whole destination cell
  // instead of pushing — same bidirectional rule as the single-move
  // engine (swap outranks push/pull/stop, `still`/`pinned` still block).
  swapIds: Set<number>
}

export const resolveBatchArrows = (
  context: BatchMoveContext,
  movers: Array<{ id: number; dir: Direction; isMove: boolean; isShift?: boolean }>,
): {
  arrows: Map<number, Arrow>
  commits: Array<{
    id: number
    dir: Direction
    x: number
    y: number
    arrow: boolean
    // Officially `findupdate` only sees entries drained into
    // `updatelist` by EARLIER while-iterations — a commit is visible to
    // checks whose visit number is greater than the visit that created
    // it, and invisible within the same pass.
    stamp: number
  }>
} => {
  const arrows = new Map<number, Arrow>()
  const queue: number[] = []
  // One ordered movelist — the official engine appends every queued
  // entry (a pushed unit's displacement AND the mover's own step) into
  // `movelist` and drains them in insertion order, so a unit's own
  // later move overwrites a push queued on it earlier. `arrow` marks
  // entries that need the full landing pass (lock/eat/swap); bare
  // commits are push teleports. Positions stay frozen during planning,
  // so each queued destination is simply origin+dir in board coords.
  const commits: Array<{
    id: number
    dir: Direction
    x: number
    y: number
    arrow: boolean
    stamp: number
  }> = []
  // How many times each mover has been checked — its effective movelist
  // iteration. Officially `findupdate` only sees updates drained by
  // EARLIER while-iterations (movement.lua drains `movelist` into
  // `updatelist` at each iteration's end), so a first-pass check sees an
  // empty updatelist. A unit whose arrow is created by a push/pull
  // during a visit-k check officially joins at iteration k+1 — its own
  // entry drains at that iteration's end — so it inherits the creator's
  // visit and its first check already sees the drained backlog.
  const visits = new Map<number, number>()
  // Monotonic progress counter — bumped whenever an arrow resolves or a
  // commit lands, i.e. whenever a deferred re-check could see something
  // new. A mover that defers twice with no bump in between can never be
  // unblocked, so it stops instead of spinning the queue forever.
  let tick = 0
  const lastDeferTick = new Map<number, number>()
  const exhaustedTick = new Map<number, number>()

  // Official `canmove` empty branch, per cell: `still`/`locked<dir>`
  // cancels `swap` first; a cell with no remaining push/swap is
  // enterable unless `stop`/`pull` walls it off, while a still
  // `push`/`swap` empty can't be displaced and blocks outright.
  const emptyBlocked = (x: number, y: number, dir: Direction): boolean => {
    const props = context.emptyPropsAt(x, y)
    const estill = props.has('still') || props.has(LOCKED_PROPS[dir])
    const eswap = props.has('swap') && !estill
    if (!props.has('push') && !eswap)
      return props.has('pull') || props.has('stop')
    return estill
  }

  // A pushable empty forwards the push along `dir` until the chain lands
  // on a non-push empty, real units, or the board edge (which blocks).
  const emptyForwardsPush = (
    x: number,
    y: number,
    dir: Direction,
  ): boolean => {
    const props = context.emptyPropsAt(x, y)
    return (
      props.has('push') &&
      !props.has('swap') &&
      !props.has('still') &&
      !props.has(LOCKED_PROPS[dir])
    )
  }

  const addArrow = (
    id: number,
    dir: Direction,
    isMove: boolean,
    isShift = false,
  ): void => {
    if (context.removed.has(id) || arrows.has(id)) return
    arrows.set(id, {
      dir,
      escalated: false,
      flipped: false,
      isMove,
      isShift,
      status: 'pending',
    })
    queue.push(id)
  }

  // Arrows created by a push/pull commit their movelist entry at queue
  // time — officially dopush appends the pushed unit's entry inside the
  // pusher's own check, ahead of the pusher's own entry. The pending
  // resolution only confirms it: a 'stopped' arrow's commit is skipped
  // at apply.
  const precommitted = new Set<number>()
  const queueArrowPush = (
    id: number,
    dir: Direction,
    x: number,
    y: number,
    stamp: number,
    isShift = false,
  ): void => {
    if (context.removed.has(id) || arrows.has(id)) return
    addArrow(id, dir, false, isShift)
    visits.set(id, stamp)
    commits.push({
      id,
      dir,
      x: x + MOVE_DELTAS[dir][0],
      y: y + MOVE_DELTAS[dir][1],
      arrow: true,
      stamp,
    })
    tick += 1
    precommitted.add(id)
  }

  // Which pushers already queued each target this planning pass —
  // official `pushedunits` resets per root chain, so a unit may collect
  // one entry per pusher, but a mover re-checking after deferral must
  // not queue its own target twice.
  const pushers = new Map<number, Set<number>>()

  // The latest live queued destination for a unit — the official
  // `findupdate` view: only entries stamped by earlier passes are
  // visible, and an arrow's precommit only counts while the arrow
  // resolves to `moving` (a failed push never officially happened).
  const liveDest = (
    targetId: number,
    beforeStamp: number,
  ): { x: number; y: number } | undefined => {
    for (let i = commits.length - 1; i >= 0; i -= 1) {
      const commit = commits[i]!
      if (commit.id !== targetId || commit.stamp >= beforeStamp) continue
      if (commit.arrow && arrows.get(targetId)?.status !== 'moving')
        continue
      return commit
    }
    return undefined
  }

  // Official check()'s `alreadymoving` verdict, evaluated for a unit at
  // (x,y) pushing along (dx,dy): an obstacle with a visible queued
  // update is transparent when it is driving through the checked cell
  // or vacating one step further along the push axis — and for a
  // `shift`-reason chain, whenever its queued destination is any cell
  // other than the checked one. (Officially the shift clause is
  // `(nx ~= x) and (ny ~= y)` — both coords must differ.)
  const dodgedFrom = (
    targetId: number,
    x: number,
    y: number,
    dx: number,
    dy: number,
    beforeStamp: number,
    isShift: boolean,
  ): boolean => {
    const dest = liveDest(targetId, beforeStamp)
    if (!dest) return false
    if (isShift && dest.x !== x && dest.y !== y) return true
    return (
      (dest.x === x && dest.y === y) ||
      (dest.x === x + dx * 2 && dest.y === y + dy * 2)
    )
  }

  // Queue a movelist entry for a pushed unit — official dopush validates
  // the push on the frozen board (this planning board) and recurses into
  // the target's own front chain; each validated unit appends its entry
  // deepest-first, ahead of the pusher's own. Chain-internal obstacles
  // get the same `alreadymoving` dodge as the root check (official
  // trypush runs the full check() at every link).
  const queuePush = (
    id: number,
    dir: Direction,
    pusherId: number,
    visiting: Set<number>,
    stamp: number,
    isShift: boolean,
    dyn: { value: boolean },
  ): boolean => {
    if (visiting.has(id)) return true
    visiting.add(id)
    const seen = pushers.get(id)
    // A same-pusher re-push counts only while the earlier queue still
    // lands — officially the pushed unit's update enters `updatelist`
    // solely after its own chain validates. A pending arrow is still
    // speculative and a stopped one never existed, so both must fall
    // through and re-validate the chain instead of short-circuiting.
    if (seen?.has(pusherId) && liveDest(id, stamp) !== undefined)
      return true
    const item = context.byId.get(id)
    if (!item || context.removed.has(id)) return false
    if (isLockedFor(item, dir) || context.pinnedIds.has(id)) return false
    const [dx, dy] = MOVE_DELTAS[dir]
    const nx = item.x + dx
    const ny = item.y + dy
    if (!inBounds(context, nx, ny)) return false
    let targets = getLiveCellItems(context, nx, ny)
    if (!targets.length) {
      const firstProps = context.emptyPropsAt(nx, ny)
      if (
        context.eatsEmpty(item, nx, ny) ||
        emptyLockHit(context, item, firstProps) ||
        emptyWeakHit(item, firstProps) ||
        (firstProps.has('swap') && !emptyBlocked(nx, ny, dir))
      ) {
        // free entry
      } else if (emptyBlocked(nx, ny, dir)) {
        return false
      } else {
        let lookX = nx
        let lookY = ny
        while (emptyForwardsPush(lookX, lookY, dir)) {
          lookX += dx
          lookY += dy
          if (!inBounds(context, lookX, lookY)) return false
          targets = getLiveCellItems(context, lookX, lookY)
          if (targets.length) break
          if (emptyBlocked(lookX, lookY, dir)) return false
        }
      }
    }
    for (const target of targets) {
      if (context.phantomIds.has(target.id)) continue
      const targetArrow = arrows.get(target.id)
      if (targetArrow?.status === 'pending') dyn.value = true
      if (
        dodgedFrom(target.id, item.x, item.y, dx, dy, stamp, isShift)
      )
        continue
      if (context.eats(item, target)) continue
      if (isLockCollision(context, item, target)) continue
      if (
        context.weakIds.has(target.id) &&
        hasLatchedFloat(item) === hasLatchedFloat(target)
      )
        continue
      const cantMove =
        context.stillIds.has(target.id) || isLockedFor(target, dir)
      const swap = context.swapIds.has(target.id) && !cantMove
      if (swap) continue
      const push = context.pushIds.has(target.id) && !cantMove
      if (push) {
        if (!queuePush(target.id, dir, id, visiting, stamp, isShift, dyn))
          return false
        continue
      }
      const stop =
        context.stopIds.has(target.id) ||
        (cantMove &&
          (hasProp(target, 'push') || hasProp(target, 'pull')))
      const pull = context.pullIds.has(target.id) && !cantMove
      if (stop || pull) return false
      // Prop-free units stack without blocking — the pushed unit lands
      // on top of them.
    }
    if (seen) seen.add(pusherId)
    else pushers.set(id, new Set([pusherId]))
    commits.push({ id, dir, x: nx, y: ny, arrow: false, stamp })
    tick += 1
    return true
  }

  for (const mover of movers)
    addArrow(mover.id, mover.dir, mover.isMove, mover.isShift ?? false)

  let queueHead = 0
  while (queueHead < queue.length) {
    const id = queue[queueHead]
    queueHead += 1
    if (id === undefined || context.removed.has(id)) continue

    const arrow = arrows.get(id)
    if (arrow?.status !== 'pending') continue

    const item = context.byId.get(id)
    if (!item) continue
    const visit = (visits.get(id) ?? 0) + 1
    visits.set(id, visit)

    if (isLockedFor(item, arrow.dir) || context.pinnedIds.has(id)) {
      arrow.status = 'stopped'
      tick += 1
      continue
    }

    const [dx, dy] = MOVE_DELTAS[arrow.dir]
    const nx = item.x + dx
    const ny = item.y + dy

    let blocked = !inBounds(context, nx, ny)
    let defer = false
    let throughEmptyPush = false
    let targets = blocked ? [] : getLiveCellItems(context, nx, ny)

    // Official `alreadymoving` dodge (check()): an obstacle whose queued
    // destination is the mover's own cell (it is driving through) or one
    // push-step past the mover along the push axis (it is already
    // following the same direction) contributes 0 — no block, no push.
    // Queued entries only enter `updatelist` when an iteration drains,
    // so a first-pass check sees nothing; the dodge only applies once
    // this mover is re-checked after deferring.
    const dodged = (targetId: number): boolean =>
      dodgedFrom(targetId, item.x, item.y, dx, dy, visit, false)

    // Official shift dodge (check(), `reason == "shift"`): an obstacle
    // already queued to move anywhere that isn't the rider's own cell is
    // transparent — the belt carries the unit into the vacated cell. A
    // target whose arrow hasn't resolved yet is not in `updatelist`, so
    // the rider defers and re-checks once it lands.
    const shiftVerdict = (
      targetId: number,
    ): 'pending' | 'transparent' | 'solid' => {
      const targetArrow = arrows.get(targetId)
      if (targetArrow?.status === 'pending') return 'pending'
      const dest = liveDest(targetId, visit)
      if (dest && dest.x !== item.x && dest.y !== item.y)
        return 'transparent'
      return 'solid'
    }

    if (!blocked) {
      if (!targets.length) {
        // `x eat empty` frees the cell outright (official `valid=false`
        // skips the whole empty-block verdict); swapping with an empty
        // is a plain step in; a pushable empty forwards the push until
        // the chain lands somewhere.
        const firstProps = context.emptyPropsAt(nx, ny)
        if (context.eatsEmpty(item, nx, ny)) {
          // free entry — the empty pseudo-unit dies at apply time
        } else if (
          emptyLockHit(context, item, firstProps) ||
          emptyWeakHit(item, firstProps)
        ) {
          // free entry — the empty dies at apply time; an unsafe lock
          // mover dies at its own cell instead of landing
        } else if (
          firstProps.has('swap') &&
          !emptyBlocked(nx, ny, arrow.dir)
        ) {
          // free entry
        } else if (emptyBlocked(nx, ny, arrow.dir)) {
          blocked = true
        } else {
          let lookX = nx
          let lookY = ny
          while (emptyForwardsPush(lookX, lookY, arrow.dir)) {
            lookX += dx
            lookY += dy
            if (!inBounds(context, lookX, lookY)) {
              blocked = true
              break
            }
            targets = getLiveCellItems(context, lookX, lookY)
            if (targets.length) {
              throughEmptyPush = true
              break
            }
            if (emptyBlocked(lookX, lookY, arrow.dir)) {
              blocked = true
              break
            }
          }
        }
      }

      // `x is swap` movers trade places with whatever they enter —
      // officially every obstacle contributes result 0 for a swap
      // mover: nothing blocks it, and `still`/`pinned` targets simply
      // stay behind (no swap, no block).
      const swapMove = !throughEmptyPush && context.swapIds.has(id)

      if (!blocked && !swapMove) {
        let pushed = false
        for (const target of targets) {
          if (context.phantomIds.has(target.id)) continue
          // Eaten/unlocked targets are consumed where they stand —
          // officially result 0, never pushed onward.
          if (context.eats(item, target)) continue
          if (!throughEmptyPush && isLockCollision(context, item, target))
            continue
          if (!context.pushIds.has(target.id)) continue
          // Official gates the push branch on `isswap == nil`: a swap-prop
          // target is displaced into the mover's origin, never pushed.
          if (
            context.swapIds.has(target.id) &&
            !context.stillIds.has(target.id) &&
            !isLockedFor(target, arrow.dir)
          )
            continue
          if (arrow.isShift) {
            const verdict = shiftVerdict(target.id)
            // A pending arrow is invisible to a first-pass check —
            // officially nothing has drained into `updatelist` yet, so
            // the target is evaluated as a plain pushable obstacle and
            // trypush resolves its chain synchronously (both entries
            // land in movelist; the unit's own later entry wins). Only
            // a still-pending target on a re-check is a queue-ordering
            // artifact worth waiting on.
            if (verdict === 'pending' && visit > 1) {
              defer = true
              continue
            }
            if (verdict === 'transparent') continue
          }
          if (arrows.has(target.id)) {
            if (dodged(target.id)) continue
            const targetArrow = arrows.get(target.id)
            // Already carrying an arrow — official still queues a
            // second movelist entry when a different pusher shoves it;
            // a failed re-check means it stays put and blocks. The same
            // pusher re-checking after deferral just sees it vacating.
            const seen = pushers.get(target.id)
            if (!seen?.has(id)) {
              // Officially a pushable obstacle at state 0 only escalates
              // the mover — the trypush runs on the next pass once
              // earlier movers' queued updates have drained into
              // `updatelist`. A failed validation here defers the
              // re-check instead of dying, because chain-internal
              // obstacles may still vacate.
              const dyn = { value: false }
              if (
                !queuePush(
                  target.id,
                  arrow.dir,
                  id,
                  new Set(),
                  visit,
                  arrow.isShift,
                  dyn,
                )
              ) {
                if (dyn.value || visit === 1) defer = true
                else blocked = true
              }
            } else if (targetArrow?.status === 'stopped') {
              // The queued push never officially existed — the target
              // stayed put and blocks like any failed push chain.
              blocked = true
            } else if (targetArrow?.status === 'pending') {
              defer = true
            }
            continue
          }
          // Official dopush propagates `reason` — a unit pushed by a
          // shift chain keeps `reason == "shift"`, so its own check
          // applies the same queued-update dodge.
          queueArrowPush(target.id, arrow.dir, target.x, target.y, visit, arrow.isShift)
          {
            const seen = pushers.get(target.id)
            if (seen) seen.add(id)
            else pushers.set(target.id, new Set([id]))
          }
          pushed = true
        }
        if (pushed) {
          arrow.escalated = true
          queue.push(id)
          continue
        }
      }

      for (const target of targets) {
        if (context.phantomIds.has(target.id)) continue
        // Official special order: `lock` (open/shut) then `eat` — both
        // set `valid=false`, so a consumed target never blocks. The
        // removals run at apply time, only when the mover lands.
        if (!throughEmptyPush && isLockCollision(context, item, target))
          continue
        if (context.eats(item, target)) continue

        if (swapMove) {
          // Weak units are left in place (they die in the interaction
          // phase, same as the single-move engine's swap filter).
          if (context.weakIds.has(target.id)) continue
          const targetArrow = arrows.get(target.id)
          if (targetArrow?.status === 'moving') continue
          if (targetArrow?.status === 'pending') {
            defer = true
            continue
          }
          continue
        }

        // `weak` targets on the same float layer die on contact instead
        // of blocking; a cross-layer weak unit stays solid.
        const weak =
          context.weakIds.has(target.id) &&
          hasLatchedFloat(item) === hasLatchedFloat(target)
        // Official `cantmove` on the target (still / level-hold pin /
        // locked<dir>) nils `push` and `pull` into `stop` and cancels
        // `swap` — a bare `still` unit does not block entry at all.
        const cantMove =
          context.stillIds.has(target.id) ||
          isLockedFor(target, arrow.dir)
        const swap =
          context.swapIds.has(target.id) && !cantMove
        // `isswap` cancels the block/push/pull verdicts alike — a
        // swap-prop target only ever trades places with the mover.
        const stop =
          !swap &&
          (context.stopIds.has(target.id) ||
            (cantMove &&
              (hasProp(target, 'push') || hasProp(target, 'pull'))))
        const push = context.pushIds.has(target.id) && !cantMove && !swap
        const pull = context.pullIds.has(target.id) && !cantMove && !swap
        if (weak || blocked || (!push && !stop && !pull)) continue
        // Only now consult queued moves — officially the alreadymoving
        // dodge only matters for obstacles that would otherwise
        // contribute a block; a prop-free occupant (e.g. a `you` with no
        // push/stop/pull) is transparent to a shift mover even while
        // its own move is still unresolved.
        if (arrow.isShift) {
          const verdict = shiftVerdict(target.id)
          if (verdict === 'pending' && visit > 1) {
            defer = true
            continue
          }
          if (verdict === 'transparent') continue
        }
        if (dodged(target.id)) continue

        const targetArrow = arrows.get(target.id)
        if (targetArrow?.dir === arrow.dir) {
          if (targetArrow.status === 'moving') continue
          if (targetArrow.status === 'stopped') {
            blocked = true
            continue
          }
          defer = true
          continue
        }

        if (stop || pull) blocked = true
      }
    }

    // Officially every unresolved mover escalates a state and re-checks
    // on the next pass — only then can it see the queued updates drained
    // meanwhile (`findupdate`). We model the passes with deferrals: a
    // blocked or dependency-waiting mover re-checks while the frontier
    // keeps advancing (any arrow resolving or commit landing bumps
    // `tick`); once it stalls, the failure is final.
    if (blocked || defer) {
      if (lastDeferTick.get(id) !== tick) {
        lastDeferTick.set(id, tick)
        arrow.escalated = true
        queue.push(id)
        continue
      }
      if (defer && !blocked) {
        // Starvation guard: a pure dependency wait marks the tick as
        // exhausted but survives while any still-pending arrow hasn't
        // exhausted it yet — an unresolved entry later in the queue may
        // still land and clear it (officially trypush runs synchronously
        // inside the pusher's check, so it never sees this ordering
        // artifact). Once every pending arrow is exhausted at the same
        // tick, the batch is quiescent and the wait is final.
        exhaustedTick.set(id, tick)
        let pendingAhead = false
        for (const [aid, other] of arrows) {
          if (aid === id || other.status !== 'pending') continue
          if (exhaustedTick.get(aid) !== tick) {
            pendingAhead = true
            break
          }
        }
        if (pendingAhead) {
          queue.push(id)
          continue
        }
      }
      blocked = true
    }

    if (blocked) {
      if (context.weakIds.has(id) && !arrow.isMove) {
        if (removeOne(context, item)) {
          context.status.changed = true
          tick += 1
        }
        continue
      }

      if (arrow.isMove && !arrow.flipped) {
        arrow.dir = reverseDirection(arrow.dir)
        arrow.escalated = true
        arrow.flipped = true
        tick += 1
        queue.push(id)
        continue
      }

      // Official result==2 at state>=4: a `weak` mover that still cannot
      // move after the flip retry shatters instead of stopping.
      if (context.weakIds.has(id)) {
        if (removeOne(context, item)) {
          context.status.changed = true
          tick += 1
        }
        continue
      }

      arrow.status = 'stopped'
      tick += 1
      continue
    }

    const [bx, by] = MOVE_DELTAS[reverseDirection(arrow.dir)]
    const px = item.x + bx
    const py = item.y + by
    if (inBounds(context, px, py)) {
      const behind = getLiveCellItems(context, px, py)
      const queuePull = (
        target: { id: number; x: number; y: number },
        destX: number,
        destY: number,
      ): void => {
        if (arrows.has(target.id)) {
          // A second puller still queues its own movelist entry — an
          // absolute destination that overrides the earlier pull when
          // the list drains.
          commits.push({
            id: target.id,
            dir: arrow.dir,
            x: destX,
            y: destY,
            arrow: false,
            stamp: visit,
          })
          tick += 1
          return
        }
        queueArrowPush(target.id, arrow.dir, target.x, target.y, visit)
      }
      for (const target of behind) {
        if (!context.pullIds.has(target.id)) continue
        queuePull(target, item.x, item.y)
      }
      // `empty is pull` chain (official pseudo-unit 2): a pullable
      // unit-free cell behind the mover drags the cell behind IT, and
      // the recursion lands the first real pullable cargo one step
      // closer. The root pull is vetoed by any solid co-occupant of the
      // mover's own cell (trypush on the pseudo-unit).
      if (
        !behind.length &&
        !emptyPullRootBlocked(
          context,
          (cx, cy) => getLiveCellItems(context, cx, cy),
          item,
          arrow.dir,
        )
      ) {
        for (const cargo of traceEmptyPullCargo(
          context,
          (cx, cy) => getLiveCellItems(context, cx, cy),
          px,
          py,
          arrow.dir,
        ))
          queuePull(cargo, cargo.x + dx, cargo.y + dy)
      }
    }

    arrow.status = 'moving'
    tick += 1
    if (!precommitted.has(id))
      commits.push({ id, dir: arrow.dir, x: nx, y: ny, arrow: true, stamp: visit })
  }

  return { arrows, commits }
}

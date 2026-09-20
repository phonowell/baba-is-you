import {
  emptyLockHit,
  emptyWeakHit,
  getLiveCellItems,
  inBounds,
  isLockedFor,
  isLockCollision,
  LOCKED_PROPS,
  removeOne,
} from './move-core.js'
import { hasProp, MOVE_DELTAS, reverseDirection } from './shared.js'

import type { MoveCoreContext } from './move-core.js'
import type { Direction } from '../types.js'

type ArrowStatus = 'pending' | 'moving' | 'stopped'

export type Arrow = {
  dir: Direction
  flipped: boolean
  isMove: boolean
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
  movers: Array<{ id: number; dir: Direction; isMove: boolean }>,
): Map<number, Arrow> => {
  const arrows = new Map<number, Arrow>()
  const queue: number[] = []

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

  const addArrow = (id: number, dir: Direction, isMove: boolean): void => {
    if (context.removed.has(id) || arrows.has(id)) return
    arrows.set(id, {
      dir,
      flipped: false,
      isMove,
      status: 'pending',
    })
    queue.push(id)
  }

  for (const mover of movers) addArrow(mover.id, mover.dir, mover.isMove)

  let queueHead = 0
  while (queueHead < queue.length) {
    const id = queue[queueHead]
    queueHead += 1
    if (id === undefined || context.removed.has(id)) continue

    const arrow = arrows.get(id)
    if (arrow?.status !== 'pending') continue

    const item = context.byId.get(id)
    if (!item) continue

    if (isLockedFor(item, arrow.dir) || context.pinnedIds.has(id)) {
      arrow.status = 'stopped'
      continue
    }

    const [dx, dy] = MOVE_DELTAS[arrow.dir]
    const nx = item.x + dx
    const ny = item.y + dy

    let blocked = !inBounds(context, nx, ny)
    let defer = false
    let throughEmptyPush = false
    let targets = blocked ? [] : getLiveCellItems(context, nx, ny)

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
          if (arrows.has(target.id)) continue
          addArrow(target.id, arrow.dir, false)
          pushed = true
        }
        if (pushed) {
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
          hasProp(item, 'float') === hasProp(target, 'float')
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

    if (blocked) {
      if (context.weakIds.has(id) && !arrow.isMove) {
        if (removeOne(context, item)) context.status.changed = true
        continue
      }

      if (arrow.isMove && !arrow.flipped) {
        arrow.dir = reverseDirection(arrow.dir)
        arrow.flipped = true
        queue.push(id)
        continue
      }

      arrow.status = 'stopped'
      continue
    }

    if (defer) {
      queue.push(id)
      continue
    }

    const [bx, by] = MOVE_DELTAS[reverseDirection(arrow.dir)]
    const px = item.x + bx
    const py = item.y + by
    if (inBounds(context, px, py)) {
      const behind = getLiveCellItems(context, px, py)
      for (const target of behind) {
        if (!context.pullIds.has(target.id)) continue
        addArrow(target.id, arrow.dir, false)
      }
    }

    arrow.status = 'moving'
  }

  return arrows
}

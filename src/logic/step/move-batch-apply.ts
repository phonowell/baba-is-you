import {
  getLiveCellItems,
  isLockCollision,
  markEmptyLandingSpecials,
  moveOne,
  removeOne,
} from './move-core.js'

import type { Arrow, BatchMoveContext } from './move-batch-runtime.js'
import type { Direction, Item } from '../types.js'

export const applyBatchMovement = (
  context: BatchMoveContext,
  arrows: Map<number, Arrow>,
  commits: Array<{
    id: number
    dir: Direction
    x: number
    y: number
    arrow: boolean
  }>,
): void => {
  const swapIds = new Set<number>()
  for (const [id, arrow] of arrows.entries()) {
    if (arrow.status !== 'moving') continue
    if (context.removed.has(id)) continue
    if (context.swapIds.has(id)) swapIds.add(id)
  }

  // Commits drain in official movelist insertion order, except that swap
  // movers still resolve last — a target that vacated under its own
  // arrow must not be dragged back into the mover's old cell.
  const ordered = [
    ...commits.filter((c) => !(c.arrow && swapIds.has(c.id))),
    ...commits.filter((c) => c.arrow && swapIds.has(c.id)),
  ]

  for (const commit of ordered) {
    const id = commit.id
    const item = context.byId.get(id)
    // `byId` keeps dead entries (official mmf objects stay queryable) —
    // a unit removed this pass must not execute its entry.
    if (!item || context.removed.has(id)) continue

    if (!commit.arrow) {
      // Queued push entry — official `update` teleports to the absolute
      // destination and turns the unit's facing to the entry's dir.
      if (item.dir !== commit.dir) {
        item.dir = commit.dir
        context.status.changed = true
      }
      if (moveOne(context, item, commit.x, commit.y))
        context.status.changed = true
      continue
    }

    const arrow = arrows.get(id)
    // Push/pull arrows commit their entry at queue time; if the pending
    // resolution later failed, the entry never officially existed.
    if (!arrow || arrow.status !== 'moving') continue

    if (item.dir !== commit.dir) {
      item.dir = commit.dir
      context.status.changed = true
    }

    // The queued destination is absolute (computed on the planning
    // board): even if an earlier commit displaced the unit, its own
    // entry still lands at origin+dir.
    const oldX = item.x
    const oldY = item.y
    const nx = commit.x
    const ny = commit.y

    // Empty-branch specials at the destination cell (official check()
    // empty case): `x eat empty`, an open/shut lock pair, or
    // `empty is weak` destroy the empty pseudo-unit — and an unsafe lock
    // mover dies at its origin instead of landing.
    if (!getLiveCellItems(context, nx, ny).length) {
      const lockHit = markEmptyLandingSpecials(context, item, nx, ny)
      if (lockHit && removeOne(context, item)) {
        context.status.changed = true
        continue
      }
    }

    // Official `lock` specials resolve before the position update:
    // unsafe `open`/`shut` partners die at their own cell and an unsafe
    // mover dies at its ORIGIN (`gone` skips the update), so `x has y`
    // drops land on the departure cell rather than the destination.
    const lockTargets = getLiveCellItems(context, nx, ny).filter(
      (target): target is Item =>
        target.id !== id && isLockCollision(context, item, target),
    )
    for (const target of lockTargets)
      if (removeOne(context, target)) context.status.changed = true
    if (lockTargets.length && removeOne(context, item)) {
      context.status.changed = true
      continue
    }

    if (!moveOne(context, item, nx, ny)) continue
    context.status.changed = true

    // `x eat y` specials fire when the move lands: whatever the mover
    // stepped onto is consumed before swap displaces other occupants.
    for (const target of getLiveCellItems(context, nx, ny)) {
      if (target.id === id) continue
      if (context.eats(item, target)) {
        if (removeOne(context, target)) context.status.changed = true
      }
    }

    if (!swapIds.has(id)) {
      // Target-side swap (official `findfeatureat` at the destination):
      // a `x is swap` unit trades places with whatever walks in — the
      // mover doesn't need swap itself.
      const swappees = getLiveCellItems(context, nx, ny).filter(
        (target): target is Item =>
          target.id !== id &&
          context.swapIds.has(target.id) &&
          !context.phantomIds.has(target.id) &&
          !context.weakIds.has(target.id) &&
          arrows.get(target.id)?.status !== 'moving',
      )
      for (const target of swappees) {
        if (moveOne(context, target, oldX, oldY))
          context.status.changed = true
      }
      continue
    }
    // Swap: every unit still sharing the destination cell (that isn't
    // moving itself this batch, and can be displaced at all) is carried
    // back to the mover's origin.
    const cellMates = getLiveCellItems(context, nx, ny).filter(
      (target): target is Item =>
        target.id !== id &&
        !context.phantomIds.has(target.id) &&
        !context.weakIds.has(target.id) &&
        !context.stillIds.has(target.id) &&
        !context.pinnedIds.has(target.id) &&
        arrows.get(target.id)?.status !== 'moving',
    )
    for (const target of cellMates) {
      if (moveOne(context, target, oldX, oldY))
        context.status.changed = true
    }
  }

  // Official state-3 `updatedir(unitid, newdir_)` is unconditional: a
  // move/chill mover whose flip attempt also failed keeps the REVERSED
  // facing even though it never moved.
  for (const [id, arrow] of arrows) {
    if (arrow.status !== 'stopped' || !arrow.flipped) continue
    const item = context.byId.get(id)
    if (!item || context.removed.has(id) || item.dir === arrow.dir)
      continue
    item.dir = arrow.dir
    context.status.changed = true
  }
}

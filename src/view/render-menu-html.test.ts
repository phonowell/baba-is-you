import assert from 'node:assert/strict'
import test from 'node:test'

import { orderMenuLevels, renderMenuHtml } from './render-menu-html.js'

test('renderMenuHtml renders every level as a grid cell', () => {
  const levels = Array.from({ length: 13 }, (_, i) => ({ title: `L${i}` }))
  const html = renderMenuHtml({ levels, selectedLevelIndex: 6 })

  const cells = html.match(/class="menu-cell/g) ?? []
  assert.equal(cells.length, 13)
  // The selection rides the matching cell, not a sliding window.
  assert.match(html, /menu-cell selected[^"]*" role="option" data-action="start-level" data-level-index="6"/)
})

test('renderMenuHtml dims only levels explicitly marked unsolvable', () => {
  const html = renderMenuHtml({
    levels: [
      { title: 'a', hasSolution: true },
      { title: 'b', hasSolution: false },
      // Flag omitted — "unknown" renders like a solvable cell.
      { title: 'c' },
    ],
    selectedLevelIndex: 0,
  })

  const dimmed = html.match(/menu-cell[^"]*no-solution/g) ?? []
  assert.equal(dimmed.length, 1)
  assert.match(
    html,
    /menu-cell alt no-solution"[^>]*data-level-index="1"/,
  )
})

test('orderMenuLevels leads solvable levels and trails known-unsolvable ones', () => {
  const order = orderMenuLevels([
    { hasSolution: false },
    { hasSolution: true },
    { hasSolution: false },
    // Flag omitted — "unknown" renders undimmed, so it leads too.
    {},
    { hasSolution: true },
  ])

  // Stable partition: campaign order holds inside each group.
  assert.deepEqual(order, [1, 3, 4, 0, 2])
})

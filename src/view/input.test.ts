import assert from 'node:assert/strict'
import test from 'node:test'

import { SWIPE_MIN_PX, mapBoardGesture, mapMapGesture } from './input.js'

test('mapBoardGesture maps swipes to moves on the dominant axis', () => {
  assert.deepEqual(mapBoardGesture({ dx: SWIPE_MIN_PX + 10, dy: 4 }), {
    type: 'move',
    direction: 'right',
  })
  assert.deepEqual(mapBoardGesture({ dx: -(SWIPE_MIN_PX + 10), dy: -4 }), {
    type: 'move',
    direction: 'left',
  })
  assert.deepEqual(mapBoardGesture({ dx: 4, dy: SWIPE_MIN_PX + 10 }), {
    type: 'move',
    direction: 'down',
  })
  assert.deepEqual(mapBoardGesture({ dx: -4, dy: -(SWIPE_MIN_PX + 10) }), {
    type: 'move',
    direction: 'up',
  })
})

test('mapBoardGesture treats sub-threshold drags and taps as wait', () => {
  assert.deepEqual(mapBoardGesture({ dx: 0, dy: 0 }), { type: 'wait' })
  assert.deepEqual(
    mapBoardGesture({ dx: SWIPE_MIN_PX - 1, dy: 0 }),
    { type: 'wait' },
  )
  assert.deepEqual(
    mapBoardGesture({ dx: 5, dy: -(SWIPE_MIN_PX - 1) }),
    { type: 'wait' },
  )
})

test('mapMapGesture maps swipes to cursor moves on the dominant axis', () => {
  assert.deepEqual(mapMapGesture({ dx: SWIPE_MIN_PX + 10, dy: 4 }), {
    type: 'move',
    direction: 'right',
  })
  assert.deepEqual(mapMapGesture({ dx: -(SWIPE_MIN_PX + 10), dy: -4 }), {
    type: 'move',
    direction: 'left',
  })
  assert.deepEqual(mapMapGesture({ dx: 4, dy: SWIPE_MIN_PX + 10 }), {
    type: 'move',
    direction: 'down',
  })
  assert.deepEqual(mapMapGesture({ dx: -4, dy: -(SWIPE_MIN_PX + 10) }), {
    type: 'move',
    direction: 'up',
  })
})

test('mapMapGesture treats sub-threshold drags and taps as enter', () => {
  assert.deepEqual(mapMapGesture({ dx: 0, dy: 0 }), { type: 'enter' })
  assert.deepEqual(mapMapGesture({ dx: SWIPE_MIN_PX - 1, dy: 0 }), {
    type: 'enter',
  })
})

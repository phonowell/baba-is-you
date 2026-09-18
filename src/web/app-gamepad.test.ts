import assert from 'node:assert/strict'
import test from 'node:test'

import { createGamepadRuntime } from './app-gamepad.js'

import type { GamepadSource } from '../view/input-gamepad.js'
import type { GameCommand, MenuCommand } from '../view/input.js'
import type { GameStatus } from '../logic/types.js'

const pad = (
  pressed: number[] = [],
  axes: number[] = [0, 0, 0, 0],
  overrides: Partial<GamepadSource> = {},
): GamepadSource => ({
  index: 0,
  connected: true,
  mapping: 'standard',
  buttons: Array.from({ length: 17 }, (_, i) => ({
    pressed: pressed.includes(i),
  })),
  axes,
  ...overrides,
})

type RuntimeOptions = {
  mode?: 'menu' | 'game'
  dialogOpen?: boolean
  status?: GameStatus
  canHandle?: () => boolean
  handled?: (cmd: GameCommand | MenuCommand) => boolean
}

const createRuntime = (options: RuntimeOptions = {}) => {
  const frames: Array<(now: number) => void> = []
  const cancelled: number[] = []
  const listeners = new Map<string, () => void>()
  const commands: GameCommand[] = []
  const menuCommands: MenuCommand[] = []
  let pads: (GamepadSource | null)[] = []
  let marks = 0
  let closes = 0

  const runtime = createGamepadRuntime({
    viewState: {
      getMode: () => options.mode ?? 'game',
      isReferenceDialogOpen: () => options.dialogOpen ?? false,
      getStatus: () => options.status ?? 'playing',
    },
    closeReferenceDialog: () => {
      closes += 1
    },
    canHandleGameAction: options.canHandle ?? (() => true),
    markGameActionHandled: () => {
      marks += 1
    },
    handleGameCommand: (cmd) => {
      commands.push(cmd)
      return options.handled?.(cmd) ?? true
    },
    handleMenuCommand: (cmd) => {
      menuCommands.push(cmd)
      return options.handled?.(cmd) ?? true
    },
    getGamepads: () => pads,
    requestFrame: (callback) => {
      frames.push(callback)
      return frames.length
    },
    cancelFrame: (id) => {
      cancelled.push(id)
    },
    eventTarget: {
      addEventListener: (type, listener) => {
        listeners.set(type, listener)
      },
      removeEventListener: (type) => {
        listeners.delete(type)
      },
    },
  })

  return {
    runtime,
    frames,
    cancelled,
    listeners,
    commands,
    menuCommands,
    get marks() {
      return marks
    },
    get closes() {
      return closes
    },
    setPads: (next: (GamepadSource | null)[]): void => {
      pads = next
    },
    connect: (): void => {
      listeners.get('gamepadconnected')?.()
    },
    step: (now: number): void => {
      const callback = frames.shift()
      assert.ok(callback, 'expected a scheduled frame')
      callback(now)
    },
  }
}

test('gamepad runtime probes once at startup then stops when no pads exist', () => {
  const ctx = createRuntime()
  assert.equal(ctx.frames.length, 1)

  ctx.step(0)

  assert.deepEqual(ctx.commands, [])
  assert.equal(ctx.frames.length, 0)
})

test('gamepad connect starts polling and a button edge fires one command', () => {
  const ctx = createRuntime()
  ctx.step(0)

  ctx.setPads([pad()])
  ctx.connect()
  ctx.step(16) // baseline adopt, no presses yet
  ctx.setPads([pad([0])])
  ctx.step(32)
  ctx.step(48) // still held: no repeat on buttons

  assert.deepEqual(ctx.commands, [{ type: 'wait' }])
  assert.equal(ctx.marks, 1)
})

test('gamepad directions fire on press then repeat while held', () => {
  const ctx = createRuntime()
  ctx.step(0)
  ctx.setPads([pad()])
  ctx.connect()
  ctx.step(16)

  ctx.setPads([pad([15])])
  ctx.step(32) // edge press
  ctx.step(200) // held, inside the repeat delay
  ctx.step(400) // 368ms after press: past the 300ms delay
  ctx.step(500)
  ctx.step(560) // 160ms after the last fire: repeat cadence hit

  assert.deepEqual(ctx.commands, [
    { type: 'move', direction: 'right' },
    { type: 'move', direction: 'right' },
    { type: 'move', direction: 'right' },
  ])

  ctx.setPads([pad()])
  ctx.step(720)
  ctx.step(860)
  assert.equal(ctx.commands.length, 3)
})

test('gamepad dialog state ignores all input except B to close', () => {
  const ctx = createRuntime({ dialogOpen: true })
  ctx.step(0)
  ctx.setPads([pad()])
  ctx.connect()
  ctx.step(16)

  ctx.setPads([pad([15])])
  ctx.step(32)
  ctx.setPads([pad([1])])
  ctx.step(48)
  ctx.step(64) // held B must not close twice

  assert.deepEqual(ctx.commands, [])
  assert.equal(ctx.closes, 1)
})

test('gamepad menu mode routes commands without game-side bookkeeping', () => {
  const ctx = createRuntime({ mode: 'menu' })
  ctx.step(0)
  ctx.setPads([pad()])
  ctx.connect()
  ctx.step(16)

  ctx.setPads([pad([12])])
  ctx.step(32)
  ctx.setPads([pad([0])])
  ctx.step(48)

  assert.deepEqual(ctx.menuCommands, [{ type: 'up' }, { type: 'start' }])
  assert.equal(ctx.marks, 0)
})

test('gamepad A advances as next on the win card', () => {
  const ctx = createRuntime({ status: 'win' })
  ctx.step(0)
  ctx.setPads([pad()])
  ctx.connect()
  ctx.step(16)

  ctx.setPads([pad([0])])
  ctx.step(32)

  assert.deepEqual(ctx.commands, [{ type: 'next' }])
})

test('gamepad unhandled or cooldown-blocked input is not marked handled', () => {
  const ctx = createRuntime({ handled: () => false })
  ctx.step(0)
  ctx.setPads([pad()])
  ctx.connect()
  ctx.step(16)
  ctx.setPads([pad([0])])
  ctx.step(32)
  assert.equal(ctx.commands.length, 1)
  assert.equal(ctx.marks, 0)

  const cooling = createRuntime({ canHandle: () => false })
  cooling.step(0)
  cooling.setPads([pad()])
  cooling.connect()
  cooling.step(16)
  cooling.setPads([pad([0])])
  cooling.step(32)
  assert.equal(cooling.commands.length, 0)
  assert.equal(cooling.marks, 0)
})

test('gamepad ignores pads without a standard mapping', () => {
  const ctx = createRuntime()
  ctx.step(0)
  ctx.setPads([pad([0], undefined, { mapping: '' })])
  ctx.connect()
  ctx.step(16)

  assert.deepEqual(ctx.commands, [])
  // A pad that can never fire does not keep the loop alive — a later
  // `gamepadconnected` (any pad) restarts polling.
  assert.equal(ctx.frames.length, 0)

  ctx.setPads([pad()])
  ctx.connect()
  ctx.step(32)
  assert.equal(ctx.frames.length, 1)
})

test('gamepad polling stops itself once every pad disappears', () => {
  const ctx = createRuntime()
  ctx.step(0)
  ctx.setPads([pad()])
  ctx.connect()
  ctx.step(16)
  assert.equal(ctx.frames.length, 1)

  ctx.setPads([null])
  ctx.step(32)

  assert.equal(ctx.frames.length, 0)
})

test('gamepad dispose cancels the poll, removes the listener, and blocks ticks', () => {
  const ctx = createRuntime()
  ctx.step(0)
  ctx.setPads([pad()])
  ctx.connect()
  assert.equal(ctx.frames.length, 1)

  ctx.runtime.dispose()

  assert.deepEqual(ctx.cancelled, [1])
  assert.equal(ctx.listeners.size, 0)

  // A stale queued frame after dispose must not reschedule or dispatch.
  const stale = ctx.frames.shift()
  assert.ok(stale)
  ctx.setPads([pad([0])])
  stale(48)
  assert.equal(ctx.frames.length, 0)
  assert.deepEqual(ctx.commands, [])

  ctx.runtime.dispose()
  assert.deepEqual(ctx.cancelled, [1])
})

test('gamepad swapping pads does not replay held buttons', () => {
  const ctx = createRuntime()
  ctx.step(0)
  ctx.setPads([pad()])
  ctx.connect()
  ctx.step(16)

  // A different pad index appears with A already held — it becomes the
  // new baseline instead of a phantom press.
  ctx.setPads([pad([0], undefined, { index: 1 })])
  ctx.step(32)

  assert.deepEqual(ctx.commands, [])
})

import assert from 'node:assert/strict'
import test from 'node:test'

import { createGamepadRuntime } from './app-gamepad.js'

import type { GamepadSource } from '../view/input-gamepad.js'
import type { GameCommand } from '../view/input.js'
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
  confirmOpen?: boolean
  status?: GameStatus
  canHandle?: () => boolean
  handled?: (cmd: GameCommand) => boolean
}

const createRuntime = (options: RuntimeOptions = {}) => {
  const frames: Array<(now: number) => void> = []
  const cancelled: number[] = []
  const listeners = new Map<string, (event: unknown) => void>()
  const commands: GameCommand[] = []
  let pads: (GamepadSource | null)[] = []
  let marks = 0
  let closes = 0
  let confirmCloses = 0
  let toggles = 0
  let dialogOpen = options.dialogOpen ?? false

  const runtime = createGamepadRuntime({
    viewState: {
      getMode: () => options.mode ?? 'game',
      isReferenceDialogOpen: () => dialogOpen,
      isReplayConfirmOpen: () => options.confirmOpen ?? false,
      getStatus: () => options.status ?? 'playing',
    },
    closeReferenceDialog: () => {
      closes += 1
    },
    toggleReferenceDialog: () => {
      toggles += 1
    },
    closeReplayConfirm: () => {
      confirmCloses += 1
    },
    canHandleGameAction: options.canHandle ?? (() => true),
    markGameActionHandled: () => {
      marks += 1
    },
    handleGameCommand: (cmd) => {
      commands.push(cmd)
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
    get marks() {
      return marks
    },
    get closes() {
      return closes
    },
    get confirmCloses() {
      return confirmCloses
    },
    get toggles() {
      return toggles
    },
    setDialogOpen: (open: boolean): void => {
      dialogOpen = open
    },
    setPads: (next: (GamepadSource | null)[]): void => {
      pads = next
    },
    connect: (index = 0): void => {
      listeners.get('gamepadconnected')?.({ gamepad: { index } })
    },
    disconnect: (index = 0): void => {
      listeners.get('gamepaddisconnected')?.({ gamepad: { index } })
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
  ctx.step(48) // held, but still inside the repeat delay

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

test('gamepad replay confirm blocks input and B cancels it', () => {
  const ctx = createRuntime({ confirmOpen: true })
  ctx.step(0)
  ctx.setPads([pad()])
  ctx.connect()
  ctx.step(16)

  // Directional presses stay swallowed while the confirm is open.
  ctx.setPads([pad([15])])
  ctx.step(32)
  ctx.setPads([pad([1])])
  ctx.step(48)
  ctx.step(64) // held B must not cancel twice

  assert.deepEqual(ctx.commands, [])
  assert.equal(ctx.confirmCloses, 1)
  assert.equal(ctx.closes, 0)
})

test('gamepad menu mode moves the selection and A starts the level', () => {
  const ctx = createRuntime({ mode: 'menu' })
  ctx.step(0)
  ctx.setPads([pad()])
  ctx.connect()
  ctx.step(16)

  ctx.setPads([pad([12])])
  ctx.step(32)
  ctx.setPads([pad([0])])
  ctx.step(48)

  assert.deepEqual(ctx.commands, [
    { type: 'move', direction: 'up' },
    { type: 'enter' },
  ])
  assert.equal(ctx.marks, 2)
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

test('gamepad held A repeats wait and held B repeats undo on cadence', () => {
  const ctx = createRuntime()
  ctx.step(0)
  ctx.setPads([pad()])
  ctx.connect()
  ctx.step(16)

  ctx.setPads([pad([0])])
  ctx.step(32) // edge wait, arms the repeat slot
  ctx.step(200) // inside the 300ms delay
  ctx.step(400) // first repeat
  ctx.step(560) // +140ms cadence: second repeat

  ctx.setPads([pad([1])])
  ctx.step(700) // B edge re-arms the slot for undo
  ctx.step(1100) // first B repeat
  ctx.step(1240) // second B repeat

  assert.deepEqual(ctx.commands, [
    { type: 'wait' },
    { type: 'wait' },
    { type: 'wait' },
    { type: 'undo' },
    { type: 'undo' },
    { type: 'undo' },
  ])
})

test('gamepad B held through a dialog close never bleeds into undo', () => {
  const ctx = createRuntime({ dialogOpen: true })
  ctx.step(0)
  ctx.setPads([pad()])
  ctx.connect()
  ctx.step(16)

  ctx.setPads([pad([1])])
  ctx.step(32) // B edge closes the dialog — no repeat slot was armed
  ctx.setDialogOpen(false)
  ctx.step(400) // past the repeat delay while B is still held
  ctx.step(560)

  assert.deepEqual(ctx.commands, [])
  assert.equal(ctx.closes, 1)
})

test('gamepad select toggles the controls reference', () => {
  const ctx = createRuntime()
  ctx.step(0)
  ctx.setPads([pad()])
  ctx.connect()
  ctx.step(16)

  ctx.setPads([pad([8])])
  ctx.step(32) // opens
  ctx.step(48) // held select must not fire the toggle again
  ctx.setDialogOpen(true)
  ctx.setPads([pad()])
  ctx.step(64)
  ctx.setPads([pad([8])])
  ctx.step(80) // a second press toggles the open dialog back off

  assert.equal(ctx.toggles, 2)
  assert.deepEqual(ctx.commands, [])
})

test('gamepad rumble plays dual-rumble on the driving pad only', () => {
  const effects: { type: string; params?: unknown }[] = []
  const ctx = createRuntime()
  ctx.step(0)
  ctx.setPads([
    pad([], undefined, {
      vibrationActuator: {
        playEffect: (type, params) => {
          effects.push({ type, params })
          return Promise.resolve()
        },
      },
    }),
  ])
  ctx.connect()
  ctx.step(16)

  ctx.runtime.rumble({ durationMs: 50, startDelayMs: 20 })

  assert.deepEqual(effects, [
    {
      type: 'dual-rumble',
      params: {
        duration: 50,
        startDelay: 20,
        strongMagnitude: 1,
        weakMagnitude: 1,
      },
    },
  ])

  // Swapping to a rumble-less pad turns rumble into a no-op.
  ctx.setPads([pad([], undefined, { index: 1 })])
  ctx.step(32)
  ctx.runtime.rumble({ durationMs: 50 })
  assert.equal(effects.length, 1)

  // A rejecting actuator is swallowed — haptics are best-effort.
  ctx.setPads([
    pad([], undefined, {
      index: 2,
      vibrationActuator: {
        playEffect: () => Promise.reject(new Error('unsupported')),
      },
    }),
  ])
  ctx.step(48)
  ctx.runtime.rumble({ durationMs: 50 })

  ctx.runtime.dispose()
  ctx.runtime.rumble({ durationMs: 50 })
})

test('gamepad prefers the most recently connected pad and falls back on disconnect', () => {
  const ctx = createRuntime()
  ctx.step(0)
  ctx.setPads([pad([], undefined, { index: 0 })])
  ctx.connect(0)
  ctx.step(16)

  ctx.setPads([
    pad([], undefined, { index: 0 }),
    pad([], undefined, { index: 1 }),
  ])
  ctx.connect(1)
  ctx.step(32) // the newer pad wins the pick — baseline adopts its state
  ctx.setPads([
    pad([], undefined, { index: 0 }),
    pad([0], undefined, { index: 1 }),
  ])
  ctx.step(48)
  ctx.setPads([
    pad([0], undefined, { index: 0 }),
    pad([], undefined, { index: 1 }),
  ])
  ctx.step(64) // pad 0 pressing does nothing while pad 1 drives

  assert.deepEqual(ctx.commands, [{ type: 'wait' }])

  ctx.disconnect(1)
  ctx.setPads([pad([0], undefined, { index: 0 }), null])
  ctx.step(80) // pad 0 takes over — held A becomes the new baseline
  ctx.setPads([pad([], undefined, { index: 0 }), null])
  ctx.step(96)
  ctx.setPads([pad([0], undefined, { index: 0 }), null])
  ctx.step(112)

  assert.deepEqual(ctx.commands, [{ type: 'wait' }, { type: 'wait' }])
})

test('gamepad stick picks the dominant axis on a diagonal push', () => {
  const ctx = createRuntime()
  ctx.step(0)
  ctx.setPads([pad()])
  ctx.connect()
  ctx.step(16)

  ctx.setPads([pad([], [0.6, 0.9, 0, 0])])
  ctx.step(32) // |y| wins over the fixed order: down, not right
  ctx.setPads([pad()])
  ctx.step(48)
  ctx.setPads([pad([], [0.9, 0.6, 0, 0])])
  ctx.step(64) // dominant x this time: right

  assert.deepEqual(ctx.commands, [
    { type: 'move', direction: 'down' },
    { type: 'move', direction: 'right' },
  ])

  // A D-Pad diagonal without stick deflection keeps the fixed order.
  ctx.setPads([pad()])
  ctx.step(80)
  ctx.setPads([pad([12, 15])])
  ctx.step(96)
  assert.deepEqual(ctx.commands[2], { type: 'move', direction: 'up' })
})

#!/usr/bin/env tsx
import * as readline from 'node:readline'

import { levels } from './levels.js'
import { parseLevel } from './logic/parse-level.js'
import { createInitialState, markCampaignComplete } from './logic/state.js'
import { step } from './logic/step.js'
import { mapKeypress } from './view/input.js'
import { render } from './view/render.js'

import type { GameState } from './logic/types.js'

const levelData = levels.map((level) => parseLevel(level))

if (!process.stdin.isTTY) {
  console.error('This game requires an interactive terminal.')
  process.exit(1)
}

const firstLevel = levelData[0]
if (!firstLevel) {
  console.error('No levels available.')
  process.exit(1)
}

let levelIndex = 0
let history: GameState[] = []
let state = createInitialState(firstLevel, levelIndex)

const resetLevel = (index: number): void => {
  const nextLevel = levelData[index]
  if (!nextLevel) throw new Error(`Invalid level index: ${index}`)

  levelIndex = index
  history = []
  state = createInitialState(nextLevel, levelIndex)
}

const draw = (): void => {
  process.stdout.write('\x1b[2J\x1b[H')
  process.stdout.write(render(state))
}

const handleMove = (direction: Parameters<typeof step>[1]): void => {
  if (state.status !== 'playing') return

  const result = step(state, direction)
  if (result.changed) {
    history.push(state)
    state = result.state
  }
}

const handleCommand = (cmd: ReturnType<typeof mapKeypress>): void => {
  switch (cmd.type) {
    case 'move':
      handleMove(cmd.direction)
      break
    case 'undo':
      if (history.length) state = history.pop() ?? state

      break
    case 'restart':
      if (state.status === 'complete') {
        resetLevel(0)
        break
      }
      resetLevel(levelIndex)
      break
    case 'next':
      if (state.status === 'win') {
        if (levelIndex === levelData.length - 1) {
          state = markCampaignComplete(state)
          break
        }
        resetLevel(levelIndex + 1)
        break
      }
      if (state.status === 'complete') resetLevel(0)

      break
    case 'quit':
      process.exit(0)
    case 'noop':
      break
  }
}

readline.emitKeypressEvents(process.stdin)
process.stdin.setRawMode(true)

process.stdin.on('keypress', (_str, key) => {
  const cmd = mapKeypress(key)
  handleCommand(cmd)
  draw()
})

process.on('SIGINT', () => {
  process.exit(0)
})

draw()

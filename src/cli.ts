#!/usr/bin/env tsx
import * as readline from 'node:readline'

import { levels } from './levels.js'
import { parseLevel } from './logic/parse-level.js'
import { createInitialState, markCampaignComplete } from './logic/state.js'
import { step } from './logic/step.js'
import { mapGameKeypress, mapMenuKeypress } from './view/input.js'
import { MENU_WINDOW_SIZE, renderMenu } from './view/render-menu.js'
import { render } from './view/render.js'

import type { GameState } from './logic/types.js'

type AppMode = 'menu' | 'game'

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

const firstLevelIndex = 0
const latestLevelIndex = levelData.length - 1
let mode: AppMode = 'menu'
let menuSelectedLevelIndex = firstLevelIndex

let levelIndex = firstLevelIndex
let history: GameState[] = []
let state = createInitialState(levelData[levelIndex] ?? firstLevel, levelIndex)

const resetLevel = (index: number): void => {
  const nextLevel = levelData[index]
  if (!nextLevel) throw new Error(`Invalid level index: ${index}`)

  levelIndex = index
  history = []
  state = createInitialState(nextLevel, levelIndex)
}

const enterGame = (index: number): void => {
  resetLevel(index)
  mode = 'game'
}

const returnToMenu = (): void => {
  menuSelectedLevelIndex = levelIndex
  history = []
  mode = 'menu'
}

const draw = (): void => {
  process.stdout.write('\x1b[2J\x1b[H')
  if (mode === 'menu') {
    process.stdout.write(
      renderMenu({
        levels: levelData.map((level) => ({ title: level.title })),
        selectedLevelIndex: menuSelectedLevelIndex,
      }),
    )
    return
  }
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

const handleGameCommand = (cmd: ReturnType<typeof mapGameKeypress>): void => {
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
    case 'back-menu':
      returnToMenu()
      break
    case 'noop':
      break
  }
}

const handleMenuCommand = (cmd: ReturnType<typeof mapMenuKeypress>): void => {
  switch (cmd.type) {
    case 'up':
      if (menuSelectedLevelIndex > 0) menuSelectedLevelIndex -= 1
      break
    case 'down':
      if (menuSelectedLevelIndex < latestLevelIndex) menuSelectedLevelIndex += 1
      break
    case 'page-left':
      menuSelectedLevelIndex = Math.max(
        0,
        menuSelectedLevelIndex - MENU_WINDOW_SIZE,
      )
      break
    case 'page-right':
      menuSelectedLevelIndex = Math.min(
        latestLevelIndex,
        menuSelectedLevelIndex + MENU_WINDOW_SIZE,
      )
      break
    case 'start':
      enterGame(menuSelectedLevelIndex)
      break
    case 'quit-app':
      process.exit(0)
    case 'noop':
      break
  }
}

readline.emitKeypressEvents(process.stdin)
process.stdin.setRawMode(true)

process.stdin.on('keypress', (_str, key) => {
  if (key.ctrl && key.name === 'c') process.exit(0)

  if (mode === 'menu') handleMenuCommand(mapMenuKeypress(key))
  else handleGameCommand(mapGameKeypress(key))

  draw()
})

process.on('SIGINT', () => {
  process.exit(0)
})

draw()

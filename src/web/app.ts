import { levels } from '../levels.js'
import { parseLevel } from '../logic/parse-level.js'
import { createInitialState, markCampaignComplete } from '../logic/state.js'
import { step } from '../logic/step.js'
import { mapGameKeyboardEvent, mapMenuKeyboardEvent } from '../view/input-web.js'
import { getBoardEntities, renderHtml, statusLine } from '../view/render-html.js'
import { MENU_WINDOW_SIZE } from '../view/render-menu.js'
import { renderMenuHtml } from '../view/render-menu-html.js'

import type { GameState } from '../logic/types.js'

type AppMode = 'menu' | 'game'
const GAME_INPUT_COOLDOWN_MS = 150

const levelData = levels.map((level) => parseLevel(level))
const firstLevel = levelData[0]
if (!firstLevel) throw new Error('No levels available.')

const menuLevels = levelData.map((level) => ({ title: level.title }))
const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')

const root = globalThis.document.getElementById('app')
if (!root) throw new Error('Missing #app container.')

const firstLevelIndex = 0
const latestLevelIndex = levelData.length - 1

let mode: AppMode = 'menu'
let menuSelectedLevelIndex = firstLevelIndex
let levelIndex = firstLevelIndex
let history: GameState[] = []
let state = createInitialState(levelData[levelIndex] ?? firstLevel, levelIndex)
let showReferenceDialog = false
let lastGameActionMs = 0

let prevMode: AppMode | null = null
let prevShowDialog = false
let prevBoardSignature: string | null = null
let boardEl: HTMLElement | null = null
let statusEl: HTMLElement | null = null
const entityElements = new Map<number, HTMLElement>()

const closeReferenceDialog = (): void => {
  showReferenceDialog = false
}

const resetLevel = (index: number): void => {
  const nextLevel = levelData[index]
  if (!nextLevel) throw new Error(`Invalid level index: ${index}`)

  levelIndex = index
  history = []
  closeReferenceDialog()
  state = createInitialState(nextLevel, levelIndex)
}

const enterGame = (index: number): void => {
  resetLevel(index)
  mode = 'game'
}

const returnToMenu = (): void => {
  menuSelectedLevelIndex = levelIndex
  history = []
  closeReferenceDialog()
  mode = 'menu'
}

const computeCellSize = (): number => {
  const gap = 1
  const availW = window.innerWidth - 18
  const availH = window.innerHeight - 104
  const maxByW = Math.floor((availW - gap * (state.width - 1)) / state.width)
  const maxByH = Math.floor((availH - gap * (state.height - 1)) / state.height)
  return Math.min(44, Math.max(12, Math.min(maxByW, maxByH)))
}

const syncBoardEntities = (): void => {
  if (!boardEl) return
  const entities = getBoardEntities(state)
  const seenIds = new Set<number>()

  for (const entity of entities) {
    seenIds.add(entity.id)
    let el = entityElements.get(entity.id)
    if (!el) {
      el = document.createElement('div')
      el.className = entity.className
      const span = document.createElement('span')
      span.className = 'value'
      span.textContent = entity.value
      el.appendChild(span)
      el.style.setProperty('--cx', String(entity.x))
      el.style.setProperty('--cy', String(entity.y))
      boardEl.appendChild(el)
      entityElements.set(entity.id, el)
    } else {
      if (el.className !== entity.className) el.className = entity.className
      const valueEl = el.querySelector('.value')
      if (valueEl instanceof HTMLSpanElement && valueEl.textContent !== entity.value)
        valueEl.textContent = entity.value
      el.style.setProperty('--cx', String(entity.x))
      el.style.setProperty('--cy', String(entity.y))
    }
  }

  for (const [id, el] of entityElements) {
    if (!seenIds.has(id)) {
      el.remove()
      entityElements.delete(id)
    }
  }
}

const applyWithTransition = (fn: () => void): void => {
  if (!reducedMotionQuery.matches && document.startViewTransition) {
    document.startViewTransition(fn)
  } else {
    fn()
  }
}

const draw = (): void => {
  document.title =
    mode === 'game' ? `${levelIndex + 1}. ${state.title} – Baba Is You` : 'Baba Is You'

  if (mode === 'game') {
    document.documentElement.style.setProperty('--cell-size', `${computeCellSize()}px`)
  }

  const modeChanged = mode !== prevMode
  const dialogChanged = showReferenceDialog !== prevShowDialog
  const nextBoardSignature =
    mode === 'game' ? `${levelIndex}:${state.width}x${state.height}` : null
  const boardChanged = nextBoardSignature !== prevBoardSignature
  prevMode = mode
  prevShowDialog = showReferenceDialog
  prevBoardSignature = nextBoardSignature

  if (modeChanged || dialogChanged || mode === 'menu' || boardChanged) {
    const html =
      mode === 'menu'
        ? renderMenuHtml({ levels: menuLevels, selectedLevelIndex: menuSelectedLevelIndex })
        : renderHtml(state, { showReferenceDialog })

    applyWithTransition(() => {
      root.innerHTML = html
      boardEl = root.querySelector<HTMLElement>('.board')
      statusEl = root.querySelector<HTMLElement>('.status')
      entityElements.clear()
      if (mode === 'game') syncBoardEntities()
    })
    return
  }

  syncBoardEntities()
  if (statusEl) statusEl.textContent = statusLine(state.status)
}

const handleMove = (direction: Parameters<typeof step>[1]): boolean => {
  if (state.status !== 'playing') return false

  const result = step(state, direction)
  if (!result.changed) return false

  history.push(state)
  state = result.state
  return true
}

const handleGameCommand = (
  cmd: ReturnType<typeof mapGameKeyboardEvent>,
): boolean => {
  switch (cmd.type) {
    case 'move':
      return handleMove(cmd.direction)
    case 'undo':
      if (!history.length) return false
      state = history.pop() ?? state
      return true
    case 'restart':
      if (state.status === 'complete') {
        resetLevel(0)
        return true
      }
      resetLevel(levelIndex)
      return true
    case 'next':
      if (state.status === 'win') {
        if (levelIndex === levelData.length - 1) {
          state = markCampaignComplete(state)
          return true
        }
        resetLevel(levelIndex + 1)
        return true
      }

      if (state.status === 'complete') {
        resetLevel(0)
        return true
      }

      return false
    case 'back-menu':
      returnToMenu()
      return true
    case 'noop':
      return false
  }
}

const handleMenuCommand = (
  cmd: ReturnType<typeof mapMenuKeyboardEvent>,
): boolean => {
  switch (cmd.type) {
    case 'up':
      if (menuSelectedLevelIndex > 0) menuSelectedLevelIndex -= 1
      return true
    case 'down':
      if (menuSelectedLevelIndex < latestLevelIndex) menuSelectedLevelIndex += 1
      return true
    case 'page-left':
      menuSelectedLevelIndex = Math.max(
        0,
        menuSelectedLevelIndex - MENU_WINDOW_SIZE,
      )
      return true
    case 'page-right':
      menuSelectedLevelIndex = Math.min(
        latestLevelIndex,
        menuSelectedLevelIndex + MENU_WINDOW_SIZE,
      )
      return true
    case 'start':
      enterGame(menuSelectedLevelIndex)
      return true
    case 'quit-app':
      return true
    case 'noop':
      return false
  }
}

root.addEventListener('click', (event) => {
  const target = event.target
  if (!(target instanceof HTMLElement)) return

  const actionElement = target.closest<HTMLElement>('[data-action]')
  if (actionElement) {
    const action = actionElement.dataset.action
    if (action === 'start-level' && mode === 'menu') {
      const idx = parseInt(actionElement.dataset.levelIndex ?? '', 10)
      if (!isNaN(idx) && idx >= 0 && idx < levelData.length) {
        menuSelectedLevelIndex = idx
        enterGame(idx)
        draw()
      }
      return
    }

    if (action === 'toggle-reference' && mode === 'game') {
      showReferenceDialog = !showReferenceDialog
      draw()
      return
    }

    if (action === 'close-reference' && mode === 'game') {
      closeReferenceDialog()
      draw()
    }

    return
  }

  if (!showReferenceDialog || mode !== 'game') return

  const backdrop = target.closest<HTMLElement>('[data-role="reference-backdrop"]')
  const dialog = target.closest<HTMLElement>('[data-role="reference-dialog"]')
  if (backdrop && !dialog) {
    closeReferenceDialog()
    draw()
  }
})

globalThis.window.addEventListener('keydown', (event) => {
  if (mode === 'game' && showReferenceDialog) {
    if (event.key === 'Escape') {
      closeReferenceDialog()
      event.preventDefault()
      draw()
    }
    return
  }

  if (mode === 'game' && Date.now() - lastGameActionMs < GAME_INPUT_COOLDOWN_MS)
    return

  const handled =
    mode === 'menu'
      ? handleMenuCommand(mapMenuKeyboardEvent(event))
      : handleGameCommand(mapGameKeyboardEvent(event))

  if (!handled) return

  event.preventDefault()
  if (mode === 'game') lastGameActionMs = Date.now()
  draw()
})

let resizeTimer = 0
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer)
  resizeTimer = window.setTimeout(draw, 60)
})

draw()

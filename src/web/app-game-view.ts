import { GAMEPAD_CONTROLS } from '../view/input-gamepad.js'
import { GAME_CONTROLS, GAME_TOUCH_CONTROLS } from '../view/input.js'
import {
  renderReferenceControlsHtml,
  renderReferenceRulesHtml,
} from '../view/render-html.js'
import { statusLine } from '../view/status-line.js'

import type { GameState } from '../logic/types.js'
import type { BoardHoverTipElements } from './app-hover.js'
import type { ReplayProgress } from './app-model.js'

export type GameViewUpdate = {
  showReferenceDialog: boolean
  replay: ReplayProgress | null
  canUndo: boolean
}

type CreateGameViewOptions = {
  document: Document
  // Whether the board on screen has a recorded golden — the toolbar's
  // Solution button only exists then.
  hasGoldenReplay?: boolean
}

export type GameView = {
  root: HTMLElement
  boardEl: HTMLElement
  hoverTip: BoardHoverTipElements
  update: (state: GameState, view: GameViewUpdate) => void
}

const createElement = <K extends keyof HTMLElementTagNameMap>(
  document: Document,
  tag: K,
  className?: string,
): HTMLElementTagNameMap[K] => {
  const element = document.createElement(tag)
  if (className) element.className = className
  return element
}

const SVG_ATTRS =
  'xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"'

const HUD_ICONS = {
  undo: `<svg ${SVG_ATTRS}><path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/></svg>`,
  wait: `<svg ${SVG_ATTRS}><path d="M6 5l8 7-8 7"/><path d="M17 5v14"/></svg>`,
  restart: `<svg ${SVG_ATTRS}><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>`,
  menu: `<svg ${SVG_ATTRS}><path d="M9 6h11M9 12h11M9 18h11"/><path d="M5 6h.01M5 12h.01M5 18h.01"/></svg>`,
} as const

const createIconButton = (
  document: Document,
  action: string,
  label: string,
  icon: string,
): HTMLButtonElement => {
  const button = document.createElement('button')
  button.className = 'btn icon-btn'
  button.dataset.action = action
  button.setAttribute('aria-label', label)
  button.title = label
  button.innerHTML = icon
  return button
}

const createOutcomeButton = (
  document: Document,
  action: string,
  label: string,
  primary = false,
): HTMLButtonElement => {
  const button = document.createElement('button')
  button.className = primary ? 'btn outcome-btn primary' : 'btn outcome-btn'
  button.dataset.action = action
  button.textContent = label
  return button
}

const outcomeTitleFor = (status: GameState['status']): string =>
  status === 'win' ? 'Level Clear' : 'Defeat'

export const createGameView = (options: CreateGameViewOptions): GameView => {
  const { document, hasGoldenReplay = false } = options

  const root = createElement(document, 'section', 'game-screen')
  root.setAttribute('aria-label', 'Game')

  const toolbar = createElement(document, 'div', 'game-toolbar')
  const statusEl = createElement(document, 'span', 'status')
  statusEl.setAttribute('aria-live', 'polite')

  const actionsEl = createElement(document, 'div', 'game-actions')
  const undoBtn = createIconButton(
    document,
    'game-undo',
    'Undo (U)',
    HUD_ICONS.undo,
  )
  const waitBtn = createIconButton(
    document,
    'game-wait',
    'Wait (Space)',
    HUD_ICONS.wait,
  )
  const restartBtn = createIconButton(
    document,
    'game-restart',
    'Restart (R)',
    HUD_ICONS.restart,
  )
  actionsEl.append(
    undoBtn,
    waitBtn,
    restartBtn,
    createIconButton(document, 'game-menu', 'Menu (Q)', HUD_ICONS.menu),
  )

  const referenceButtonEl = createElement(document, 'button', 'btn reference-btn')
  referenceButtonEl.dataset.action = 'toggle-reference'
  referenceButtonEl.setAttribute('aria-haspopup', 'dialog')
  referenceButtonEl.textContent = 'Controls & Rules'
  // One-click golden playback for the level on screen — a plain action,
  // not a dialog: the click starts the recording straight away.
  const replayButtonEl = createElement(document, 'button', 'btn reference-btn')
  replayButtonEl.dataset.action = 'play-replay'
  replayButtonEl.textContent = 'Solution'
  toolbar.append(
    statusEl,
    actionsEl,
    ...(hasGoldenReplay ? [replayButtonEl] : []),
    referenceButtonEl,
  )

  const boardWrap = createElement(document, 'div', 'board-wrap')
  const boardEl = createElement(document, 'div', 'board')
  boardEl.setAttribute('role', 'grid')
  // Hover chip lives next to the board, not inside it — mounting the 3D
  // canvas clears the board element's children.
  const hoverTipEl = createElement(document, 'div', 'board-hover-tip')
  hoverTipEl.setAttribute('hidden', '')
  const hoverTipCoordEl = createElement(document, 'span', 'board-hover-coord')
  const hoverTipNamesEl = createElement(document, 'span', 'board-hover-names')
  hoverTipEl.append(hoverTipCoordEl, hoverTipNamesEl)
  boardWrap.append(boardEl, hoverTipEl)

  const referenceBackdropEl = createElement(document, 'div', 'reference-backdrop')
  referenceBackdropEl.dataset.role = 'reference-backdrop'
  const referenceDialogEl = createElement(document, 'section', 'reference-dialog')
  referenceDialogEl.dataset.role = 'reference-dialog'
  referenceDialogEl.setAttribute('role', 'dialog')
  referenceDialogEl.setAttribute('aria-modal', 'true')
  referenceDialogEl.setAttribute('aria-label', 'Controls and rules')

  const referenceHeader = createElement(document, 'header', 'reference-header')
  const closeButton = createElement(document, 'button', 'btn reference-close')
  closeButton.dataset.action = 'close-reference'
  closeButton.setAttribute('aria-label', 'Close controls and rules')
  closeButton.textContent = 'Close'
  referenceHeader.append(closeButton)

  // Keyboard and touch sections trade places via CSS: coarse-pointer
  // devices see touch controls instead of the WASD table.
  const keyControlsEl = createElement(document, 'div', 'key-controls')
  const controlsTitle = createElement(document, 'h3', 'reference-subtitle')
  controlsTitle.textContent = 'Controls'
  const controlsListEl = createElement(document, 'ul', 'controls-list')
  controlsListEl.innerHTML = renderReferenceControlsHtml(GAME_CONTROLS)
  keyControlsEl.append(controlsTitle, controlsListEl)

  const touchControlsEl = createElement(document, 'div', 'touch-controls')
  const touchTitle = createElement(document, 'h3', 'reference-subtitle')
  touchTitle.textContent = 'Touch'
  const touchListEl = createElement(document, 'ul', 'controls-list')
  touchListEl.innerHTML = renderReferenceControlsHtml(GAME_TOUCH_CONTROLS)
  touchControlsEl.append(touchTitle, touchListEl)

  const gamepadTitle = createElement(document, 'h3', 'reference-subtitle')
  gamepadTitle.textContent = 'Gamepad'
  const gamepadListEl = createElement(document, 'ul', 'controls-list')
  gamepadListEl.innerHTML = renderReferenceControlsHtml(GAMEPAD_CONTROLS)

  const rulesTitle = createElement(document, 'h3', 'reference-subtitle')
  rulesTitle.textContent = 'Rules'
  const rulesListEl = createElement(document, 'ul', 'rules-list')

  referenceDialogEl.append(
    referenceHeader,
    keyControlsEl,
    touchControlsEl,
    gamepadTitle,
    gamepadListEl,
    rulesTitle,
    rulesListEl,
  )
  referenceBackdropEl.append(referenceDialogEl)

  // Result card for win/lose/complete. The backdrop lets clicks through
  // (pointer-events:none) so the board stays swipe-able behind it.
  const outcomeBackdropEl = createElement(document, 'div', 'outcome-backdrop')
  outcomeBackdropEl.setAttribute('hidden', '')
  const outcomeCardEl = createElement(document, 'section', 'outcome-card')
  outcomeCardEl.setAttribute('aria-label', 'Level result')
  const outcomeTitleEl = createElement(document, 'h2', 'outcome-title')
  const outcomeActionsEl = createElement(document, 'div', 'outcome-actions')
  const outcomeNextBtn = createOutcomeButton(
    document,
    'game-next',
    'Next Level',
    true,
  )
  const outcomeUndoBtn = createOutcomeButton(document, 'game-undo', 'Undo')
  const outcomeRestartBtn = createOutcomeButton(
    document,
    'game-restart',
    'Restart',
  )
  const outcomeMapBtn = createOutcomeButton(document, 'game-menu', 'Menu')
  outcomeActionsEl.append(
    outcomeNextBtn,
    outcomeUndoBtn,
    outcomeRestartBtn,
    outcomeMapBtn,
  )
  outcomeCardEl.append(outcomeTitleEl, outcomeActionsEl)
  outcomeBackdropEl.append(outcomeCardEl)

  root.append(toolbar, boardWrap, outcomeBackdropEl, referenceBackdropEl)

  let lastBoardWidth = -1
  let lastBoardHeight = -1

  return {
    root,
    boardEl,
    hoverTip: {
      root: hoverTipEl,
      coord: hoverTipCoordEl,
      names: hoverTipNamesEl,
    },
    update: (state: GameState, view: GameViewUpdate): void => {
      const { showReferenceDialog, replay, canUndo } = view
      // Verbs the command layer would drop are disabled instead of left
      // clickable: replay spectating only honours back, a finished board
      // takes no more turns, and undo needs history behind it.
      const replayActive = replay !== null
      undoBtn.disabled = replayActive || !canUndo
      waitBtn.disabled = replayActive || state.status !== 'playing'
      restartBtn.disabled = replayActive
      outcomeNextBtn.disabled = replayActive
      outcomeUndoBtn.disabled = replayActive || !canUndo
      outcomeRestartBtn.disabled = replayActive

      statusEl.textContent = replay
        ? `SOLUTION ${replay.name} — ${replay.cursor}/${replay.total}`
        : statusLine(state.status)
      statusEl.dataset.status = state.status

      const showOutcome = state.status === 'win' || state.status === 'lose'
      outcomeBackdropEl.toggleAttribute('hidden', !showOutcome)
      if (showOutcome) {
        outcomeCardEl.dataset.status = state.status
        outcomeTitleEl.textContent = outcomeTitleFor(state.status)
        // 'Next Level' advances the list on a win; 'Menu' exits either way —
        // the card shows only the applicable verb at a time.
        outcomeNextBtn.toggleAttribute('hidden', state.status !== 'win')
        outcomeMapBtn.toggleAttribute('hidden', state.status === 'win')
      }
      referenceButtonEl.setAttribute(
        'aria-expanded',
        showReferenceDialog ? 'true' : 'false',
      )
      referenceBackdropEl.toggleAttribute('hidden', !showReferenceDialog)
      // The modal dialog sits over the board — a parked cursor's tip would
      // linger underneath it otherwise.
      if (showReferenceDialog) hoverTipEl.setAttribute('hidden', '')
      if (state.width !== lastBoardWidth || state.height !== lastBoardHeight) {
        lastBoardWidth = state.width
        lastBoardHeight = state.height
        boardEl.style.setProperty('--board-width', String(state.width))
        boardEl.style.setProperty('--board-height', String(state.height))
      }
      // The dialog is hidden in normal play — rebuilding its DOM every turn
      // is wasted work; it is (re)filled on the same update that opens it.
      if (showReferenceDialog) {
        rulesListEl.innerHTML = renderReferenceRulesHtml(state)
      }
    },
  }
}

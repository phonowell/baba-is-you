import { GAMEPAD_CONTROLS } from '../view/input-gamepad.js'
import {
  renderReferenceControlsHtml,
  renderReferenceRulesHtml,
} from '../view/render-html.js'
import { statusLine } from '../view/status-line.js'

import type { GameState } from '../logic/types.js'

type CreateGameViewOptions = {
  document: Document
}

export type GameView = {
  root: HTMLElement
  boardEl: HTMLElement
  update: (state: GameState, showReferenceDialog: boolean) => void
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

const outcomeTitleFor = (status: GameState['status']): string => {
  if (status === 'win') return 'Level Clear'
  if (status === 'complete') return 'All Levels Clear'
  return 'Defeat'
}

export const createGameView = (options: CreateGameViewOptions): GameView => {
  const { document } = options

  const root = createElement(document, 'section', 'game-screen')
  root.setAttribute('aria-label', 'Game')

  const toolbar = createElement(document, 'div', 'game-toolbar')
  const statusEl = createElement(document, 'span', 'status')
  statusEl.setAttribute('aria-live', 'polite')

  const actionsEl = createElement(document, 'div', 'game-actions')
  actionsEl.append(
    createIconButton(document, 'game-undo', 'Undo (U)', HUD_ICONS.undo),
    createIconButton(document, 'game-wait', 'Wait (Space)', HUD_ICONS.wait),
    createIconButton(document, 'game-restart', 'Restart (R)', HUD_ICONS.restart),
    createIconButton(document, 'game-menu', 'Menu (Q)', HUD_ICONS.menu),
  )

  const referenceButtonEl = createElement(document, 'button', 'btn reference-btn')
  referenceButtonEl.dataset.action = 'toggle-reference'
  referenceButtonEl.setAttribute('aria-haspopup', 'dialog')
  referenceButtonEl.textContent = 'Controls & Rules'
  toolbar.append(statusEl, actionsEl, referenceButtonEl)

  const boardWrap = createElement(document, 'div', 'board-wrap')
  const boardEl = createElement(document, 'div', 'board')
  boardEl.setAttribute('role', 'grid')
  boardWrap.append(boardEl)

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

  const controlsTitle = createElement(document, 'h3', 'reference-subtitle')
  controlsTitle.textContent = 'Controls'
  const controlsListEl = createElement(document, 'ul', 'controls-list')
  controlsListEl.innerHTML = renderReferenceControlsHtml()

  const gamepadTitle = createElement(document, 'h3', 'reference-subtitle')
  gamepadTitle.textContent = 'Gamepad'
  const gamepadListEl = createElement(document, 'ul', 'controls-list')
  gamepadListEl.innerHTML = renderReferenceControlsHtml(GAMEPAD_CONTROLS)

  const rulesTitle = createElement(document, 'h3', 'reference-subtitle')
  rulesTitle.textContent = 'Rules'
  const rulesListEl = createElement(document, 'ul', 'rules-list')

  referenceDialogEl.append(
    referenceHeader,
    controlsTitle,
    controlsListEl,
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
  outcomeActionsEl.append(
    outcomeNextBtn,
    createOutcomeButton(document, 'game-undo', 'Undo'),
    createOutcomeButton(document, 'game-restart', 'Restart'),
    createOutcomeButton(document, 'game-menu', 'Menu'),
  )
  outcomeCardEl.append(outcomeTitleEl, outcomeActionsEl)
  outcomeBackdropEl.append(outcomeCardEl)

  root.append(toolbar, boardWrap, outcomeBackdropEl, referenceBackdropEl)

  let lastBoardWidth = -1
  let lastBoardHeight = -1

  return {
    root,
    boardEl,
    update: (state: GameState, showReferenceDialog: boolean): void => {
      statusEl.textContent = statusLine(state.status)
      statusEl.dataset.status = state.status

      const showOutcome =
        state.status === 'win' ||
        state.status === 'lose' ||
        state.status === 'complete'
      outcomeBackdropEl.toggleAttribute('hidden', !showOutcome)
      if (showOutcome) {
        outcomeCardEl.dataset.status = state.status
        outcomeTitleEl.textContent = outcomeTitleFor(state.status)
        // On 'complete' the next command just replays level 0 — the Restart
        // button already covers it, so the primary stays win-only.
        outcomeNextBtn.toggleAttribute('hidden', state.status !== 'win')
      }
      referenceButtonEl.setAttribute(
        'aria-expanded',
        showReferenceDialog ? 'true' : 'false',
      )
      referenceBackdropEl.toggleAttribute('hidden', !showReferenceDialog)
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

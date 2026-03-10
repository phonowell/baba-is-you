import {
  renderReferenceLegendHtml,
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

export const createGameView = (options: CreateGameViewOptions): GameView => {
  const { document } = options

  const root = createElement(document, 'section', 'game-screen')
  root.setAttribute('aria-label', 'Game')

  const toolbar = createElement(document, 'div', 'game-toolbar')
  const statusEl = createElement(document, 'span', 'status')
  statusEl.setAttribute('aria-live', 'polite')
  const referenceButtonEl = createElement(document, 'button', 'btn reference-btn')
  referenceButtonEl.dataset.action = 'toggle-reference'
  referenceButtonEl.setAttribute('aria-haspopup', 'dialog')
  referenceButtonEl.textContent = 'Rules & Legend'
  toolbar.append(statusEl, referenceButtonEl)

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
  referenceDialogEl.setAttribute('aria-label', 'Rules and legend')

  const referenceHeader = createElement(document, 'header', 'reference-header')
  const closeButton = createElement(document, 'button', 'btn reference-close')
  closeButton.dataset.action = 'close-reference'
  closeButton.setAttribute('aria-label', 'Close rules and legend')
  closeButton.textContent = 'Close'
  referenceHeader.append(closeButton)

  const rulesTitle = createElement(document, 'h3', 'reference-subtitle')
  rulesTitle.textContent = 'Rules'
  const rulesListEl = createElement(document, 'ul', 'rules-list')

  const legendTitle = createElement(document, 'h3', 'reference-subtitle')
  legendTitle.textContent = 'Legend'
  const legendListEl = createElement(document, 'ul', 'legend-list')

  referenceDialogEl.append(
    referenceHeader,
    rulesTitle,
    rulesListEl,
    legendTitle,
    legendListEl,
  )
  referenceBackdropEl.append(referenceDialogEl)
  root.append(toolbar, boardWrap, referenceBackdropEl)

  return {
    root,
    boardEl,
    update: (state: GameState, showReferenceDialog: boolean): void => {
      statusEl.textContent = statusLine(state.status)
      referenceButtonEl.setAttribute(
        'aria-expanded',
        showReferenceDialog ? 'true' : 'false',
      )
      referenceBackdropEl.toggleAttribute('hidden', !showReferenceDialog)
      boardEl.style.setProperty('--board-width', String(state.width))
      boardEl.style.setProperty('--board-height', String(state.height))
      rulesListEl.innerHTML = renderReferenceRulesHtml(state)
      legendListEl.innerHTML = renderReferenceLegendHtml(state)
    },
  }
}

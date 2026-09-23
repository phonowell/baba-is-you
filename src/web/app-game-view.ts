import { GAMEPAD_CONTROLS } from '../view/input-gamepad.js'
import { GAME_CONTROLS, GAME_TOUCH_CONTROLS } from '../view/input.js'
import { renderRules } from '../view/render-helpers.js'
import {
  renderReferenceControlsHtml,
  renderRulesLinesHtml,
} from '../view/render-html.js'
import { statusLine } from '../view/status-line.js'

import type { GameState } from '../logic/types.js'
import type { BoardHoverTipElements } from './app-hover.js'
import type { ReplayProgress } from './app-model.js'

export type GameViewUpdate = {
  showReferenceDialog: boolean
  showReplayConfirm: boolean
  replay: ReplayProgress | null
  canUndo: boolean
  // Menu-order number for the level plate — the same numeral the grid
  // cell showed, so "level 7" means the same thing in both modes.
  levelMenuNum: number
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

// A pixel-drawn bulb for the reveal-the-answer verb — the game's own
// chunky grid language, tinted by the button's ink via currentColor.
const SOLUTION_ICON_SVG =
  '<svg viewBox="0 0 7 10" shape-rendering="crispEdges">' +
  '<path fill="currentColor" d="M2 0h3v1H2zM1 1h1v1H1zM5 1h1v1H5zM0 2h1v3H0zM6 2h1v3H6zM3 2h1v2H3zM1 5h1v1H1zM5 5h1v1H5zM2 6h1v1H2zM4 6h1v1H4zM2 7h3v2H2zM3 9h1v1H3z"/>' +
  '</svg>'

// A glyph button: the icon names the verb's domain (a pixel bulb
// reveals a recorded answer, ▶ runs it); the text labels the target.
// Icons arrive as inner markup — an inline SVG or a bare glyph.
const createGlyphButton = (
  document: Document,
  action: string,
  label: string,
  className: string,
  iconHtml: string,
): HTMLButtonElement => {
  const button = document.createElement('button')
  button.className = `btn replay-btn ${className}`
  button.dataset.action = action
  const icon = document.createElement('span')
  icon.className = 'btn-icon'
  icon.setAttribute('aria-hidden', 'true')
  icon.innerHTML = iconHtml
  const text = document.createElement('span')
  text.textContent = label
  button.append(icon, text)
  return button
}

const outcomeTitleFor = (status: GameState['status']): string =>
  status === 'win' ? 'Level Clear' : 'Defeat'

export const createGameView = (options: CreateGameViewOptions): GameView => {
  const { document, hasGoldenReplay = false } = options

  const root = createElement(document, 'section', 'game-screen')
  root.setAttribute('aria-label', 'Game')

  const toolbar = createElement(document, 'div', 'game-toolbar')
  // Persistent stage plate: the menu's cell number plus the level title,
  // so the HUD always names what is on the board — the same "domain
  // plate" games pin beside the objective line.
  const levelBadgeEl = createElement(document, 'span', 'level-badge')
  const levelBadgeNumEl = createElement(document, 'span', 'level-badge-num')
  const levelBadgeNameEl = createElement(document, 'span', 'level-badge-name')
  levelBadgeEl.append(levelBadgeNumEl, levelBadgeNameEl)
  const statusEl = createElement(document, 'span', 'status')
  statusEl.setAttribute('aria-live', 'polite')

  // Mid-game verbs for pointer users — the same commands the keyboard
  // map fires (Undo/Wait/Restart/Menu), so a mouse-only session can
  // still leave the board and rewind a mistake.
  const actionsEl = createElement(document, 'div', 'game-actions')
  const createActionButton = (action: string, label: string, hint: string) => {
    const button = createElement(document, 'button', 'btn action-btn')
    button.dataset.action = action
    button.textContent = label
    button.title = hint
    button.setAttribute('aria-label', hint)
    return button
  }
  const undoBtn = createActionButton('game-undo', 'Undo', 'Undo (U)')
  const waitBtn = createActionButton('game-wait', 'Wait', 'Wait (Space)')
  const restartBtn = createActionButton('game-restart', 'Restart', 'Restart (R)')
  const menuBtn = createActionButton('game-menu', 'Menu', 'Menu (Q)')
  actionsEl.append(undoBtn, waitBtn, restartBtn, menuBtn)

  const referenceButtonEl = createElement(document, 'button', 'btn reference-btn')
  referenceButtonEl.dataset.action = 'toggle-reference'
  referenceButtonEl.setAttribute('aria-haspopup', 'dialog')
  referenceButtonEl.textContent = 'Controls'
  // Golden playback for the level on screen: the bulb marks it as the
  // reveal-the-answer verb, and because a run discards the board's
  // progress the click asks through the confirm modal below before
  // starting.
  const replayButtonEl = createGlyphButton(
    document,
    'play-replay',
    'Solution',
    'reference-btn',
    SOLUTION_ICON_SVG,
  )
  replayButtonEl.setAttribute('aria-haspopup', 'dialog')
  // Left cluster names the stage and offers its answer verb; the right
  // cluster carries the hint/status line and the panel verb.
  toolbar.append(
    levelBadgeEl,
    ...(hasGoldenReplay ? [replayButtonEl] : []),
    statusEl,
    actionsEl,
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

  // Live rules tracker — the translucent HUD panel floating on the
  // board. Fresh rules flash in; broken ones linger one beat as struck-
  // out ghosts so a collapsed rule is felt, not just absent.
  const rulesHudEl = createElement(document, 'aside', 'rules-hud')
  rulesHudEl.setAttribute('aria-label', 'Active rules')
  rulesHudEl.setAttribute('hidden', '')
  const rulesHudTitle = createElement(document, 'h3', 'rules-hud-title')
  rulesHudTitle.textContent = 'Rules'
  const rulesHudListEl = createElement(document, 'ul', 'rules-hud-list')
  const rulesGhostListEl = createElement(document, 'ul', 'rules-ghosts')
  rulesHudEl.append(rulesHudTitle, rulesHudListEl, rulesGhostListEl)
  boardWrap.append(boardEl, hoverTipEl, rulesHudEl)

  const referenceBackdropEl = createElement(document, 'div', 'reference-backdrop')
  referenceBackdropEl.dataset.role = 'reference-backdrop'
  const referenceDialogEl = createElement(document, 'section', 'reference-dialog')
  referenceDialogEl.dataset.role = 'reference-dialog'
  referenceDialogEl.setAttribute('role', 'dialog')
  referenceDialogEl.setAttribute('aria-modal', 'true')
  referenceDialogEl.setAttribute('aria-label', 'Controls')

  const referenceHeader = createElement(document, 'header', 'reference-header')
  const referenceTitle = createElement(document, 'h2', 'reference-title')
  referenceTitle.textContent = 'Controls'
  const closeButton = createElement(document, 'button', 'btn reference-close')
  closeButton.dataset.action = 'close-reference'
  closeButton.setAttribute('aria-label', 'Close controls and rules')
  closeButton.textContent = '✕'
  referenceHeader.append(referenceTitle, closeButton)

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

  const gamepadControlsEl = createElement(document, 'div', 'gamepad-controls')
  const gamepadTitle = createElement(document, 'h3', 'reference-subtitle')
  gamepadTitle.textContent = 'Gamepad'
  const gamepadListEl = createElement(document, 'ul', 'controls-list')
  gamepadListEl.innerHTML = renderReferenceControlsHtml(GAMEPAD_CONTROLS)
  gamepadControlsEl.append(gamepadTitle, gamepadListEl)

  // Single column — the live rules moved out to the board HUD, only the
  // input schemes stay in the dialog.
  const referenceBody = createElement(document, 'div', 'reference-body')
  const controlsColEl = createElement(document, 'div', 'reference-col')
  controlsColEl.append(keyControlsEl, touchControlsEl, gamepadControlsEl)
  referenceBody.append(controlsColEl)

  referenceDialogEl.append(referenceHeader, referenceBody)
  referenceBackdropEl.append(referenceDialogEl)

  // Result card for win/lose/complete. The backdrop lets clicks through
  // (pointer-events:none) so the board stays swipe-able behind it.
  const outcomeBackdropEl = createElement(document, 'div', 'outcome-backdrop')
  outcomeBackdropEl.setAttribute('hidden', '')
  const outcomeCardEl = createElement(document, 'section', 'outcome-card')
  outcomeCardEl.setAttribute('aria-label', 'Level result')
  const outcomeTitleEl = createElement(document, 'h2', 'outcome-title')
  // Gilded flourish between the verdict and its verbs — the same
  // divider ornament the result panels in big-budget games draw.
  const outcomeOrnamentEl = createElement(document, 'div', 'outcome-ornament')
  outcomeOrnamentEl.setAttribute('aria-hidden', 'true')
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
  outcomeCardEl.append(outcomeTitleEl, outcomeOrnamentEl, outcomeActionsEl)
  outcomeBackdropEl.append(outcomeCardEl)

  // Second-thought modal for the Solution button: playback rebuilds the
  // board from the golden, so the confirm names the cost (lost progress)
  // before it commits. Backdrop blocks the board while it asks.
  const replayConfirmBackdropEl = createElement(
    document,
    'div',
    'replay-confirm-backdrop',
  )
  replayConfirmBackdropEl.dataset.role = 'replay-confirm-backdrop'
  replayConfirmBackdropEl.setAttribute('hidden', '')
  const replayConfirmDialogEl = createElement(
    document,
    'section',
    'replay-confirm-dialog',
  )
  replayConfirmDialogEl.dataset.role = 'replay-confirm-dialog'
  replayConfirmDialogEl.setAttribute('role', 'dialog')
  replayConfirmDialogEl.setAttribute('aria-modal', 'true')
  replayConfirmDialogEl.setAttribute('aria-label', 'Play solution')
  const replayConfirmTitle = createElement(
    document,
    'h2',
    'replay-confirm-title',
  )
  replayConfirmTitle.textContent = 'Play Solution?'
  const replayConfirmText = createElement(document, 'p', 'replay-confirm-text')
  replayConfirmText.textContent =
    'The recorded solution plays out on this board — current progress is lost.'
  const replayConfirmActions = createElement(
    document,
    'div',
    'replay-confirm-actions',
  )
  const replayConfirmPlayEl = createGlyphButton(
    document,
    'confirm-replay',
    'Play',
    'replay-confirm-btn primary',
    '▶',
  )
  const replayConfirmCancelEl = createElement(
    document,
    'button',
    'btn replay-confirm-btn',
  )
  replayConfirmCancelEl.dataset.action = 'cancel-replay'
  replayConfirmCancelEl.textContent = 'Cancel'
  replayConfirmActions.append(replayConfirmPlayEl, replayConfirmCancelEl)
  replayConfirmDialogEl.append(
    replayConfirmTitle,
    replayConfirmText,
    replayConfirmActions,
  )
  replayConfirmBackdropEl.append(replayConfirmDialogEl)

  root.append(
    toolbar,
    boardWrap,
    outcomeBackdropEl,
    referenceBackdropEl,
    replayConfirmBackdropEl,
  )

  let lastBoardWidth = -1
  let lastBoardHeight = -1
  let prevRuleLines: string[] = []

  return {
    root,
    boardEl,
    hoverTip: {
      root: hoverTipEl,
      coord: hoverTipCoordEl,
      names: hoverTipNamesEl,
    },
    update: (state: GameState, view: GameViewUpdate): void => {
      const {
        showReferenceDialog,
        showReplayConfirm,
        replay,
        canUndo,
        levelMenuNum,
      } = view
      // Verbs the command layer would drop are disabled instead of left
      // clickable: replay spectating only honours back, and undo needs
      // history behind it.
      const replayActive = replay !== null
      undoBtn.disabled = replayActive || !canUndo
      waitBtn.disabled = replayActive || state.status !== 'playing'
      restartBtn.disabled = replayActive
      outcomeNextBtn.disabled = replayActive
      outcomeUndoBtn.disabled = replayActive || !canUndo
      outcomeRestartBtn.disabled = replayActive

      levelBadgeNumEl.textContent = String(levelMenuNum).padStart(3, '0')
      levelBadgeNameEl.textContent = state.title

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
      replayButtonEl.setAttribute(
        'aria-expanded',
        showReplayConfirm ? 'true' : 'false',
      )
      replayConfirmBackdropEl.toggleAttribute('hidden', !showReplayConfirm)
      // A modal dialog sits over the board — a parked cursor's tip would
      // linger underneath it otherwise.
      if (showReferenceDialog || showReplayConfirm) {
        hoverTipEl.setAttribute('hidden', '')
      }
      if (state.width !== lastBoardWidth || state.height !== lastBoardHeight) {
        lastBoardWidth = state.width
        lastBoardHeight = state.height
        boardEl.style.setProperty('--board-width', String(state.width))
        boardEl.style.setProperty('--board-height', String(state.height))
      }
      // Rules tracker: rebuilt every turn — a handful of <li>s, cheap.
      // Lines that just formed get a .rules-fresh flash; lines that just
      // collapsed drop into the ghost list as struck-out rows fading out
      // over ~1s, so a broken rule is felt rather than silently absent.
      const ruleLines = renderRules(state.rules)
      const activeLines =
        ruleLines.length === 1 && ruleLines[0] === '(no rules)'
          ? []
          : ruleLines
      const freshLines = new Set(
        activeLines.filter((line) => !prevRuleLines.includes(line)),
      )
      const brokenLines = prevRuleLines.filter(
        (line) => !activeLines.includes(line),
      )
      prevRuleLines = activeLines

      rulesHudListEl.innerHTML = renderRulesLinesHtml(ruleLines)
      for (const li of Array.from(rulesHudListEl.children ?? [])) {
        if (li.textContent && freshLines.has(li.textContent)) {
          li.classList.add('rules-fresh')
        }
      }
      for (const line of brokenLines) {
        const ghost = createElement(document, 'li', 'rules-broken')
        ghost.textContent = line
        rulesGhostListEl.append(ghost)
        // Fake-DOM tests lack Element.remove — the optional call keeps
        // the sweep harmless there while browsers drop the faded row.
        setTimeout(() => ghost.remove?.(), 1100)
      }
      rulesHudEl.toggleAttribute(
        'hidden',
        activeLines.length === 0 &&
          (rulesGhostListEl.children?.length ?? 0) === 0,
      )
    },
  }
}

import type { GameState } from '../logic/types.js'
import type { BoardPickRect } from './board-3d-hover.js'

// The two-line chip that trails the cursor: coordinates on the left,
// the cell's card names after it. Lives as a `.board` sibling because
// mounting the 3D canvas wipes the board element's children.
export type BoardHoverTipElements = {
  root: HTMLElement
  coord: HTMLElement
  names: HTMLElement
}

export type MapViewportPoint = (x: number, y: number) => { x: number; y: number }

type HoverRenderer = {
  setHoverAtPoint: (
    clientX: number,
    clientY: number,
    rect: BoardPickRect,
  ) => { x: number; y: number } | null
  clearHover: () => void
}

type CreateBoardHoverDeps = {
  getGameState: () => GameState | null
  getTip: () => BoardHoverTipElements | null
  getRenderer: () => HoverRenderer | null
  // Modal guards (reference dialog): a parked cursor re-picks on every
  // store tick, so refresh must honor the same block the pointer does.
  isBlocked?: () => boolean
  mapViewportPoint?: MapViewportPoint
}

export type BoardHover = {
  move: (board: HTMLElement, clientX: number, clientY: number) => void
  clear: () => void
  // Re-evaluate the parked cursor after a state change — the cell's cards
  // may have moved while the pointer stayed still.
  refresh: () => void
}

const IDENTITY_POINT: MapViewportPoint = (x, y) => ({ x, y })

// Portrait phones render the app rotated 90° (see style.css): element
// rects arrive in viewport space, so both corners go through the same
// inverse mapping applied to the pointer point itself.
export const appSpaceRect = (
  rect: { left: number; top: number; right: number; bottom: number },
  mapPoint: MapViewportPoint,
): BoardPickRect => {
  const a = mapPoint(rect.left, rect.top)
  const b = mapPoint(rect.right, rect.bottom)
  return {
    left: Math.min(a.x, b.x),
    top: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  }
}

// `level is move`-style room scrolls shift card render positions by
// `levelOffset` while logical positions stay put — invert the shift so
// the tip reports the cell the rules engine sees.
export const visualCellToLogical = (
  state: GameState,
  cell: { x: number; y: number },
): { x: number; y: number } => {
  const offsetX = state.levelOffset?.x ?? 0
  const offsetY = state.levelOffset?.y ?? 0
  if (offsetX === 0 && offsetY === 0) return cell
  return {
    x: (((cell.x - offsetX) % state.width) + state.width) % state.width,
    y: (((cell.y - offsetY) % state.height) + state.height) % state.height,
  }
}

// Card labels: object tiles keep their lowercase name, text tiles use the
// uppercase word shown on the card face (board-3d-shared-item). Hidden
// cards are skipped — they aren't on screen.
export const cellItemNames = (
  state: GameState,
  x: number,
  y: number,
): string[] => {
  const names: string[] = []
  for (const item of state.items) {
    if (item.x !== x || item.y !== y) continue
    if (item.props.includes('hide')) continue
    names.push(item.isText ? item.name.toUpperCase() : item.name)
  }
  return names
}

const TIP_OFFSET_X = 14
const TIP_OFFSET_Y = 18
const TIP_MARGIN = 8

export type HoverTipWriter = {
  show: (
    point: { x: number; y: number },
    bounds: BoardPickRect,
    cell: { x: number; y: number },
    names: readonly string[],
  ) => void
  hide: () => void
}

// Pointermove fires far more often than the chip's content changes, so
// every DOM write is gated on a real diff: text/attributes only change
// per cell, the size read (which forces layout while dirty) only after
// those writes, and the position goes through `transform` — a write that
// stays compositor-side and never dirties layout for the next move.
export const createHoverTipWriter = (
  tip: BoardHoverTipElements,
): HoverTipWriter => {
  let shown = false
  let coordText = ''
  let namesText = ''
  let namesList: readonly string[] | null = null
  // The names span starts visible in the DOM — its first empty render
  // must write the attribute, so the cache may not assume it hidden.
  let namesHidden = false
  let tipWidth = 0
  let tipHeight = 0
  let lastLeft = Number.NaN
  let lastTop = Number.NaN

  return {
    show: (point, bounds, cell, names) => {
      const coord = `(${cell.x}, ${cell.y})`
      const contentChanged = coord !== coordText || names !== namesList
      if (contentChanged) {
        const joined = names.join(', ')
        if (coord !== coordText) tip.coord.textContent = coordText = coord
        if (joined !== namesText) tip.names.textContent = namesText = joined
        const hideNames = names.length === 0
        if (hideNames !== namesHidden) {
          tip.names.toggleAttribute('hidden', hideNames)
          namesHidden = hideNames
        }
        namesList = names
      }
      // Unconditional: the game view's dialog guard can hide the chip
      // behind our back, and removing an absent attribute is a no-op.
      tip.root.removeAttribute('hidden')
      shown = true
      // offsetWidth is only trusted after a content change — same content
      // means same size, so the cached value stays valid across moves.
      if (contentChanged || tipWidth === 0) {
        tipWidth = tip.root.offsetWidth
        tipHeight = tip.root.offsetHeight
      }
      // Trailing the cursor down-right; flip when the tip would overflow.
      let left = point.x - bounds.left + TIP_OFFSET_X
      let top = point.y - bounds.top + TIP_OFFSET_Y
      const maxLeft = bounds.width - tipWidth - TIP_MARGIN
      const maxTop = bounds.height - tipHeight - TIP_MARGIN
      if (left > maxLeft) {
        left = point.x - bounds.left - tipWidth - TIP_OFFSET_X
      }
      if (top > maxTop) {
        top = point.y - bounds.top - tipHeight - TIP_OFFSET_Y
      }
      left = Math.max(TIP_MARGIN, left)
      top = Math.max(TIP_MARGIN, top)
      if (left !== lastLeft || top !== lastTop) {
        lastLeft = left
        lastTop = top
        tip.root.style.transform = `translate3d(${left}px, ${top}px, 0)`
      }
    },
    hide: () => {
      if (!shown) return
      shown = false
      tip.root.setAttribute('hidden', '')
    },
  }
}

export const createBoardHover = (deps: CreateBoardHoverDeps): BoardHover => {
  const {
    getGameState,
    getTip,
    getRenderer,
    isBlocked,
    mapViewportPoint = IDENTITY_POINT,
  } = deps

  let lastHover: {
    board: HTMLElement
    clientX: number
    clientY: number
  } | null = null
  let writerForTip: BoardHoverTipElements | null = null
  let writer: HoverTipWriter | null = null
  // The names scan walks every item on the board — keying it on the state
  // ref + logical cell means it only re-runs when the turn or the picked
  // cell actually changed, not on every pixel the cursor travels.
  let namesCache: {
    state: GameState
    x: number
    y: number
    names: string[]
  } | null = null

  const writerFor = (tip: BoardHoverTipElements): HoverTipWriter => {
    if (writerForTip !== tip || !writer) {
      writerForTip = tip
      writer = createHoverTipWriter(tip)
    }
    return writer
  }

  const clearTip = (): void => {
    const tip = getTip()
    if (tip) writerFor(tip).hide()
  }

  const namesFor = (
    state: GameState,
    x: number,
    y: number,
  ): readonly string[] => {
    const cache = namesCache
    if (cache && cache.state === state && cache.x === x && cache.y === y) {
      return cache.names
    }
    const names = cellItemNames(state, x, y)
    namesCache = { state, x, y, names }
    return names
  }

  const update = (
    board: HTMLElement,
    clientX: number,
    clientY: number,
  ): void => {
    const state = getGameState()
    const renderer = getRenderer()
    const tip = getTip()
    if (!state || !renderer || !tip || isBlocked?.()) {
      renderer?.clearHover()
      if (tip) writerFor(tip).hide()
      return
    }
    const point = mapViewportPoint(clientX, clientY)
    // In game mode the board fills its wrap (game-3d-fullscreen), so this
    // one rect serves both the raycast pick and the tip's clamp bounds.
    const rect = appSpaceRect(
      board.getBoundingClientRect(),
      mapViewportPoint,
    )
    const cell = renderer.setHoverAtPoint(point.x, point.y, rect)
    if (!cell) {
      writerFor(tip).hide()
      return
    }
    const logical = visualCellToLogical(state, cell)
    writerFor(tip).show(
      point,
      rect,
      logical,
      namesFor(state, logical.x, logical.y),
    )
  }

  return {
    move: (board, clientX, clientY) => {
      // Browsers double-fire pointermove; identical repeats cost a full
      // pick + DOM pass for nothing.
      if (
        lastHover?.board === board &&
        lastHover.clientX === clientX &&
        lastHover.clientY === clientY
      ) {
        return
      }
      lastHover = { board, clientX, clientY }
      update(board, clientX, clientY)
    },
    clear: () => {
      lastHover = null
      namesCache = null
      getRenderer()?.clearHover()
      clearTip()
    },
    refresh: () => {
      if (!lastHover) return
      if (!lastHover.board.isConnected) {
        // The board element was rebuilt (level switch) — drop the parked
        // hover rather than repoint it at a stranger's chip.
        lastHover = null
        namesCache = null
        getRenderer()?.clearHover()
        clearTip()
        return
      }
      update(lastHover.board, lastHover.clientX, lastHover.clientY)
    },
  }
}

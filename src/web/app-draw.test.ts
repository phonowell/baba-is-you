import assert from 'node:assert/strict'
import test from 'node:test'

import { createDraw } from './app-draw.js'

import type { GameState } from '../logic/types.js'

type FakeElement = HTMLElement & {
  children: FakeElement[]
  attributes: Map<string, string>
}

type FakeDocument = Document & {
  body: FakeElement
  documentElement: FakeElement
}

const createState = (): GameState => ({
  levelIndex: 0,
  title: 'draw-test',
  width: 3,
  height: 2,
  items: [],
  rules: [],
  status: 'playing',
  turn: 0,
})

const createFakeElement = (
  ownerDocument: FakeDocument,
  tagName: string,
): FakeElement => {
  const children: FakeElement[] = []
  const attributes = new Map<string, string>()
  const styleValues = new Map<string, string>()
  let className = ''
  let textContent = ''
  let innerHTML = ''

  const element = {
    ownerDocument,
    tagName: tagName.toUpperCase(),
    children,
    attributes,
    dataset: {},
    parentElement: null,
    get className() {
      return className
    },
    set className(value: string) {
      className = value
    },
    classList: {
      add: (...values: string[]) => {
        const next = new Set(className.split(/\s+/).filter(Boolean))
        for (const value of values) next.add(value)
        className = [...next].join(' ')
      },
      remove: (...values: string[]) => {
        const next = new Set(className.split(/\s+/).filter(Boolean))
        for (const value of values) next.delete(value)
        className = [...next].join(' ')
      },
      contains: (value: string) => className.split(/\s+/).filter(Boolean).includes(value),
      toggle: (value: string, force?: boolean) => {
        const exists = className.split(/\s+/).filter(Boolean).includes(value)
        if (force === true || (!exists && force !== false)) {
          element.classList.add(value)
          return true
        }
        if (exists) element.classList.remove(value)
        return false
      },
    } as DOMTokenList,
    style: {
      setProperty: (name: string, value: string) => {
        styleValues.set(name, value)
      },
      getPropertyValue: (name: string) => styleValues.get(name) ?? '',
    } as CSSStyleDeclaration,
    get textContent() {
      return textContent
    },
    set textContent(value: string) {
      textContent = value
      if (value === '') children.length = 0
    },
    get innerHTML() {
      return innerHTML
    },
    set innerHTML(value: string) {
      innerHTML = value
    },
    append: (...nodes: FakeElement[]) => {
      for (const node of nodes) {
        ;(node as unknown as { parentElement: HTMLElement | null }).parentElement =
          element as unknown as HTMLElement
        children.push(node)
      }
    },
    appendChild: <T extends Node>(child: T): T => {
      ;(child as unknown as { parentElement: HTMLElement | null }).parentElement =
        element as unknown as HTMLElement
      children.push(child as unknown as FakeElement)
      return child
    },
    replaceChildren: (...nodes: FakeElement[]) => {
      children.length = 0
      element.append(...nodes)
    },
    setAttribute: (name: string, value: string) => {
      attributes.set(name, value)
    },
    toggleAttribute: (name: string, force?: boolean) => {
      const shouldHave = force ?? !attributes.has(name)
      if (shouldHave) attributes.set(name, '')
      else attributes.delete(name)
      return shouldHave
    },
  } as unknown as FakeElement

  return element
}

const createFakeDocument = (): FakeDocument => {
  const document = {
    title: '',
  } as FakeDocument

  document.createElement = ((tagName: string) =>
    createFakeElement(document, tagName)) as Document['createElement']
  document.body = createFakeElement(document, 'body')
  document.documentElement = createFakeElement(document, 'html')
  return document
}

test('createDraw mounts 3d board after deferred transition callback builds game view', () => {
  const state = createState()
  const fakeDocument = createFakeDocument()
  const root = createFakeElement(fakeDocument, 'main')
  const previousDocument = globalThis.document

  const transitionCallbacks: Array<() => void> = []
  const mountCalls: Array<{ board: HTMLElement; state: GameState }> = []

  globalThis.document = fakeDocument

  try {
    const draw = createDraw({
      root,
      drawState: {
        prevMode: null,
        prevShowDialog: false,
        prevBoardSignature: null,
        prevCellSize: null,
        gameView: null,
      },
      menuLevels: [{ title: 'draw-test' }],
      getSnapshot: () => ({
        mode: 'game',
        menuSelectedLevelIndex: 0,
        levelIndex: 0,
        state,
        showReferenceDialog: false,
        showReplayConfirm: false,
        replay: null,
        canUndo: false,
      }),
      computeCellSize: () => 44,
      applyWithTransition: (fn) => {
        transitionCallbacks.push(fn)
      },
      unmountBoard3d: () => undefined,
      mountAndSyncBoard3d: (board, boardState) => {
        mountCalls.push({ board, state: boardState })
      },
    })

    draw()

    assert.equal(mountCalls.length, 0)
    assert.equal(transitionCallbacks.length, 1)

    const runTransition = transitionCallbacks[0]
    assert.ok(runTransition)
    runTransition()

    assert.equal(mountCalls.length, 1)
    assert.equal(mountCalls[0]?.board.className, 'board')
    assert.equal(mountCalls[0]?.state, state)
  } finally {
    globalThis.document = previousDocument
  }
})

test('createDraw repaints the menu preview on both render paths', () => {
  const state = createState()
  const fakeDocument = createFakeDocument()
  const root = createFakeElement(fakeDocument, 'main')
  const previousDocument = globalThis.document

  // In-place update needs a DOM the updater recognizes: cells the
  // selector lookups resolve, a position readout, the preview figure,
  // and its canvas.
  const canvas = createFakeElement(fakeDocument, 'canvas')
  const preview = createFakeElement(fakeDocument, 'figure')
  const positionEl = createFakeElement(fakeDocument, 'p')
  const scrolledTo: number[] = []
  const rows = [0, 1].map((index) => {
    const row = createFakeElement(fakeDocument, 'li')
    row.dataset.levelIndex = String(index)
    ;(row as unknown as { scrollIntoView: () => void }).scrollIntoView =
      () => {
        scrolledTo.push(index)
      }
    return row
  })
  root.querySelector = ((selector: string) => {
    if (selector === '.menu-preview-canvas') return canvas
    if (selector === '.menu-preview') return preview
    if (selector === '.menu-position') return positionEl
    if (selector === '.menu-cell.selected') {
      return rows.find((row) => row.classList.contains('selected')) ?? null
    }
    const cellMatch = /^\.menu-cell\[data-level-index="(\d+)"\]$/.exec(selector)
    if (cellMatch) return rows[Number(cellMatch[1])] ?? null
    return null
  }) as HTMLElement['querySelector']

  const transitionCallbacks: Array<() => void> = []
  const paintCalls: number[] = []
  const snapshot = {
    mode: 'menu' as const,
    menuSelectedLevelIndex: 0,
    levelIndex: 0,
    state,
    showReferenceDialog: false,
    showReplayConfirm: false,
    replay: null,
    canUndo: false,
  }

  globalThis.document = fakeDocument

  try {
    const draw = createDraw({
      root,
      drawState: {
        prevMode: null,
        prevShowDialog: false,
        prevBoardSignature: null,
        prevCellSize: null,
        gameView: null,
      },
      menuLevels: [{ title: 'one' }, { title: 'two' }],
      getSnapshot: () => snapshot,
      computeCellSize: () => 44,
      paintMenuPreview: (target, index) => {
        assert.equal(target, canvas)
        paintCalls.push(index)
      },
      applyWithTransition: (fn) => {
        transitionCallbacks.push(fn)
      },
      unmountBoard3d: () => undefined,
      mountAndSyncBoard3d: () => undefined,
    })

    // Fresh entry → full innerHTML render, then a first paint.
    draw()
    transitionCallbacks[0]?.()
    assert.deepEqual(paintCalls, [0])

    // Selection move → in-place update repaints, the clickable preview
    // figure tracks the new selection, and the target cell is scrolled
    // into view (keyboard moves can land off-screen in the full grid).
    snapshot.menuSelectedLevelIndex = 1
    draw()
    transitionCallbacks[1]?.()
    assert.deepEqual(paintCalls, [0, 1])
    assert.equal(preview.dataset.levelIndex, '1')
    assert.equal(rows[1]?.classList.contains('selected'), true)
    // The fresh render already revealed index 0; the move reveals 1.
    assert.deepEqual(scrolledTo, [0, 1])
  } finally {
    globalThis.document = previousDocument
  }
})

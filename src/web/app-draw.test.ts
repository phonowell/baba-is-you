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
      menuLevels: [{ title: state.title }],
      drawState: {
        prevMode: null,
        prevShowDialog: false,
        prevBoardSignature: null,
        prevCellSize: null,
        gameView: null,
      },
      getSnapshot: () => ({
        mode: 'game',
        levelIndex: 0,
        state,
        showReferenceDialog: false,
        menuSelectedLevelIndex: 0,
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

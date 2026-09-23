import assert from 'node:assert/strict'
import test from 'node:test'

import { parseLevel } from '../logic/parse-level.js'
import { createInitialState } from '../logic/state.js'
import { createGameView } from './app-game-view.js'

import type { GameState } from '../logic/types.js'

type FakeElement = HTMLElement & {
  children: FakeElement[]
  attributes: Map<string, string>
}

type FakeDocument = Document & {
  body: FakeElement
  documentElement: FakeElement
}

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
    } as DOMTokenList,
    style: {
      setProperty: (name: string, value: string) => {
        styleValues.set(name, value)
      },
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

const findByClass = (
  root: FakeElement,
  cls: string,
): FakeElement | null => {
  if (root.className.split(/\s+/).includes(cls)) return root
  for (const child of root.children) {
    const hit = findByClass(child, cls)
    if (hit) return hit
  }
  return null
}

const collectClasses = (root: FakeElement, out: string[] = []): string[] => {
  out.push(...root.className.split(/\s+/).filter(Boolean))
  for (const child of root.children) collectClasses(child, out)
  return out
}

const stateWithRules = (): GameState => {
  const level = parseLevel(
    'title Rules HUD; size 3x1; Baba 0,0; Is 1,0; You 2,0; Flag 0,0; Is 1,0; Win 2,0',
  )
  return createInitialState(level, 0)
}

const updateView = (
  view: ReturnType<typeof createGameView>,
  state: GameState,
  update: Partial<Parameters<ReturnType<typeof createGameView>['update']>[1]> = {},
): void =>
  view.update(state, {
    showReferenceDialog: false,
    showReplayConfirm: false,
    replay: null,
    canUndo: false,
    levelMenuNum: 1,
    ...update,
  })

test('game view shows active rules on the board HUD, not in the controls dialog', () => {
  const view = createGameView({ document: createFakeDocument() })
  const root = view.root as unknown as FakeElement

  updateView(view, stateWithRules())

  // The HUD lives on the board wrap so it floats over the board itself.
  const boardWrap = findByClass(root, 'board-wrap')
  const hud = findByClass(root, 'rules-hud')
  assert.ok(boardWrap && hud)
  assert.equal(hud.parentElement, boardWrap)
  assert.equal(hud.attributes.has('hidden'), false)
  assert.equal(hud.attributes.get('aria-label'), 'Active rules')

  const hudList = findByClass(hud, 'rules-hud-list')
  assert.ok(hudList)
  assert.match(hudList.innerHTML, /<li>BABA IS YOU<\/li>/)
  assert.match(hudList.innerHTML, /<li>FLAG IS WIN<\/li>/)

  // The dialog is controls-only now: no rules list may remain in it.
  const dialog = findByClass(root, 'reference-dialog')
  assert.ok(dialog)
  assert.equal(collectClasses(dialog).includes('rules-list'), false)
  for (const cls of collectClasses(dialog)) {
    assert.notEqual(cls, 'rules-hud')
  }
})

test('game view keeps a vanished rule as a ghost row and hides an empty HUD', () => {
  const view = createGameView({ document: createFakeDocument() })
  const root = view.root as unknown as FakeElement
  const hud = findByClass(root, 'rules-hud')
  const ghosts = findByClass(root, 'rules-ghosts')
  assert.ok(hud && ghosts)

  // A lone BABA IS YOU — a single active rule to watch collapse.
  const level = parseLevel('title Ghost; size 3x1; Baba 0,0; Is 1,0; You 2,0')
  const withRules = createInitialState(level, 0)
  updateView(view, withRules)
  assert.equal(hud.attributes.has('hidden'), false)

  // The rule collapses: it lingers as a struck-out ghost so the loss is
  // visible, and the HUD stays up while the ghost is still fading.
  updateView(view, { ...withRules, rules: [] })
  assert.deepEqual(
    ghosts.children.map((ghost) => ghost.textContent),
    ['BABA IS YOU'],
  )
  assert.equal(ghosts.children[0]?.className, 'rules-broken')
  assert.equal(hud.attributes.has('hidden'), false)
})

test('game view hides the rules HUD when no rules exist', () => {
  const view = createGameView({ document: createFakeDocument() })
  const root = view.root as unknown as FakeElement
  const hud = findByClass(root, 'rules-hud')
  assert.ok(hud)

  const level = parseLevel('title Empty; size 1x1; Baba 0,0')
  updateView(view, createInitialState(level, 0))

  assert.equal(hud.attributes.has('hidden'), true)
})

test('game view pairs Solution with the level badge and trails with hint + Controls plus a confirm modal', () => {
  const view = createGameView({
    document: createFakeDocument(),
    hasGoldenReplay: true,
  })
  const root = view.root as unknown as FakeElement

  const toolbar = findByClass(root, 'game-toolbar')
  assert.ok(toolbar)
  const actions = toolbar.children.map((child) => child.dataset.action)
  // Left cluster: level badge + the executing Solution verb; the
  // elastic status line then trails into the Controls panel verb.
  const solutionSlot = actions.indexOf('play-replay')
  const controlsSlot = actions.indexOf('toggle-reference')
  const badge = toolbar.children[0]
  assert.ok(badge)
  assert.ok(findByClass(badge, 'level-badge-num'))
  assert.equal(solutionSlot, 1)
  assert.equal(controlsSlot, actions.length - 1)

  const solution = toolbar.children[solutionSlot]
  assert.ok(solution)
  // The pixel-bulb icon marks the reveal-the-answer verb; it opens a
  // dialog — the ▶ run glyph belongs to the confirm's Play instead.
  assert.equal(solution.attributes.get('aria-haspopup'), 'dialog')
  const solutionIcon = findByClass(solution, 'btn-icon')
  assert.match(solutionIcon?.innerHTML ?? '', /<svg[\s>]/)

  const confirmBackdrop = findByClass(root, 'replay-confirm-backdrop')
  assert.ok(confirmBackdrop)
  assert.equal(confirmBackdrop.attributes.has('hidden'), true)
  const play = findByClass(root, 'replay-confirm-btn')
  assert.ok(play)
  assert.equal(play.dataset.action, 'confirm-replay')
  const playIcon = findByClass(play, 'btn-icon')
  assert.equal(playIcon?.innerHTML, '▶')

  const level = parseLevel('title Confirm; size 1x1; Baba 0,0')
  updateView(view, createInitialState(level, 0), { showReplayConfirm: true })
  assert.equal(confirmBackdrop.attributes.has('hidden'), false)
  assert.equal(solution.attributes.get('aria-expanded'), 'true')
})

import assert from 'node:assert/strict'
import test from 'node:test'

import { createInitialState } from './state.js'
import { step } from './step.js'

import type { LevelData, LevelItem } from './types.js'

const createItem = (
  id: number,
  name: string,
  x: number,
  y: number,
  isText: boolean,
  dir?: LevelItem['dir'],
): LevelItem => ({
  id,
  name,
  x,
  y,
  isText,
  ...(dir ? { dir } : {}),
})

const findObject = (
  state: { items: LevelItem[] },
  name: string,
): LevelItem | undefined =>
  state.items.find((item) => !item.isText && item.name === name)

const ruleRow = (
  startId: number,
  y: number,
  words: string[],
  xOffset = 0,
): LevelItem[] =>
  words.map((word, index) =>
    createItem(startId + index, word, index + xOffset, y, true),
  )

test('step NEXTTO matches orthogonal neighbours only', () => {
  // baba has a diagonal rock and no orthogonal one — nextto must not fire.
  const diagonal: LevelData = {
    title: 'nextto-diagonal',
    width: 6,
    height: 3,
    items: [
      createItem(1, 'baba', 1, 0, false),
      createItem(2, 'rock', 2, 1, false),
      ...ruleRow(3, 2, ['baba', 'nextto', 'rock', 'is', 'you']),
    ],
  }
  let result = step(createInitialState(diagonal, 0), 'right')
  assert.equal(findObject(result.state, 'baba')?.x, 1)

  const orthogonal: LevelData = {
    title: 'nextto-orthogonal',
    width: 6,
    height: 3,
    items: [
      createItem(1, 'baba', 1, 0, false),
      createItem(2, 'rock', 2, 0, false),
      ...ruleRow(3, 2, ['baba', 'nextto', 'rock', 'is', 'you']),
    ],
  }
  result = step(createInitialState(orthogonal, 0), 'right')
  assert.equal(findObject(result.state, 'baba')?.x, 2)
})

test('step WITHOUT fires only while the target is absent', () => {
  const withTarget: LevelData = {
    title: 'without-present',
    width: 6,
    height: 3,
    items: [
      createItem(1, 'baba', 1, 0, false),
      createItem(2, 'rock', 4, 0, false),
      ...ruleRow(3, 2, ['baba', 'without', 'rock', 'is', 'you']),
    ],
  }
  let result = step(createInitialState(withTarget, 0), 'right')
  assert.equal(findObject(result.state, 'baba')?.x, 1)

  const absent: LevelData = {
    title: 'without-absent',
    width: 6,
    height: 2,
    items: [
      createItem(1, 'baba', 1, 0, false),
      ...ruleRow(3, 1, ['baba', 'without', 'rock', 'is', 'you']),
    ],
  }
  result = step(createInitialState(absent, 0), 'right')
  assert.equal(findObject(result.state, 'baba')?.x, 2)
})

test('step ABOVE scans the column below the subject', () => {
  // `baba above flag` means baba sits higher than a flag — the flag is
  // somewhere in the cells below baba.
  const level: LevelData = {
    title: 'above-scan',
    width: 6,
    height: 4,
    items: [
      createItem(1, 'baba', 1, 0, false),
      createItem(2, 'flag', 1, 3, false),
      createItem(9, 'wall', 3, 0, false), // above nothing
      ...ruleRow(3, 2, ['baba', 'above', 'flag', 'is', 'you']),
    ],
  }
  const result = step(createInitialState(level, 0), 'right')
  assert.equal(findObject(result.state, 'baba')?.x, 2)
})

test('step BELOW scans the column above the subject', () => {
  const level: LevelData = {
    title: 'below-scan',
    width: 6,
    height: 4,
    items: [
      createItem(1, 'baba', 1, 3, false),
      createItem(2, 'flag', 1, 0, false),
      ...ruleRow(3, 2, ['baba', 'below', 'flag', 'is', 'you']),
    ],
  }
  const result = step(createInitialState(level, 0), 'right')
  assert.equal(findObject(result.state, 'baba')?.x, 2)
})

test('step SEEING looks along the facing ray until a solid unit blocks sight', () => {
  // baba faces right; a flag three cells away is visible through empty
  // cells, but a stop wall between them hides it.
  const clear: LevelData = {
    title: 'seeing-clear',
    width: 7,
    height: 2,
    items: [
      createItem(1, 'baba', 0, 0, false, 'right'),
      createItem(2, 'flag', 4, 0, false),
      ...ruleRow(3, 1, ['baba', 'seeing', 'flag', 'is', 'you']),
    ],
  }
  let result = step(createInitialState(clear, 0), 'right')
  assert.equal(findObject(result.state, 'baba')?.x, 1)

  const blocked: LevelData = {
    title: 'seeing-blocked',
    width: 8,
    height: 3,
    items: [
      createItem(1, 'baba', 0, 0, false, 'right'),
      createItem(2, 'flag', 4, 0, false),
      createItem(9, 'wall', 2, 0, false),
      ...ruleRow(3, 1, ['baba', 'seeing', 'flag', 'is', 'you']),
      ...ruleRow(20, 2, ['wall', 'is', 'stop']),
    ],
  }
  result = step(createInitialState(blocked, 0), 'right')
  assert.equal(findObject(result.state, 'baba')?.x, 0)
})

test('step FACEDBY matches a neighbour looking back at the subject', () => {
  // rock left of baba faces right — it faces baba, so `baba facedby rock`
  // holds; a rock facing away does not count.
  const level: LevelData = {
    title: 'facedby',
    width: 6,
    height: 3,
    items: [
      createItem(1, 'baba', 2, 0, false),
      createItem(2, 'rock', 1, 0, false, 'right'),
      createItem(9, 'wall', 4, 0, false),
      createItem(10, 'rock', 5, 0, false, 'right'), // faces away from wall
      ...ruleRow(3, 1, ['baba', 'facedby', 'rock', 'is', 'you']),
      ...ruleRow(20, 2, ['wall', 'facedby', 'rock', 'is', 'win']),
    ],
  }
  const result = step(createInitialState(level, 0), 'right')
  assert.equal(findObject(result.state, 'baba')?.x, 3)
})

test('step FEELING checks whether the subject currently holds the property', () => {
  // `baba feeling push is you` fires only while baba is push.
  const level: LevelData = {
    title: 'feeling',
    width: 7,
    height: 3,
    items: [
      createItem(1, 'baba', 0, 0, false),
      createItem(9, 'keke', 4, 0, false),
      ...ruleRow(3, 1, ['baba', 'feeling', 'push', 'is', 'you']),
      ...ruleRow(20, 2, ['baba', 'is', 'push']),
    ],
  }
  const result = step(createInitialState(level, 0), 'right')
  assert.equal(findObject(result.state, 'baba')?.x, 1)
})

test('step POWERED requires a live power source', () => {
  const unpowered: LevelData = {
    title: 'powered-off',
    width: 6,
    height: 2,
    items: [
      createItem(1, 'baba', 0, 0, false),
      ...ruleRow(3, 1, ['powered', 'baba', 'is', 'you']),
    ],
  }
  let result = step(createInitialState(unpowered, 0), 'right')
  assert.equal(findObject(result.state, 'baba')?.x, 0)

  const powered: LevelData = {
    title: 'powered-on',
    width: 7,
    height: 3,
    items: [
      createItem(1, 'baba', 0, 0, false),
      createItem(9, 'cog', 5, 0, false),
      ...ruleRow(3, 1, ['powered', 'baba', 'is', 'you']),
      ...ruleRow(20, 2, ['cog', 'is', 'power']),
    ],
  }
  result = step(createInitialState(powered, 0), 'right')
  assert.equal(findObject(result.state, 'baba')?.x, 1)
})

test('step IDLE grants the rule only on wait turns', () => {
  const level: LevelData = {
    title: 'idle',
    width: 6,
    height: 3,
    items: [
      createItem(9, 'keke', 3, 0, false),
      createItem(10, 'baba', 0, 2, false),
      ...ruleRow(3, 1, ['idle', 'keke', 'is', 'you']),
      ...ruleRow(20, 2, ['baba', 'is', 'you']).map((item) => ({
        ...item,
        x: item.x + 2,
      })),
    ],
  }
  // keke only holds `you` while the input is a wait: after a directional
  // step it has no `you`, after a wait it does.
  const state = createInitialState(level, 0)
  const afterMove = step(state, 'right')
  const kekeAfterMove = findObject(afterMove.state, 'keke')
  assert.equal(
    (kekeAfterMove as { props?: string[] })?.props?.includes('you'),
    false,
  )
  const afterWait = step(afterMove.state, null)
  const kekeAfterWait = findObject(afterWait.state, 'keke')
  assert.equal(
    (kekeAfterWait as { props?: string[] })?.props?.includes('you'),
    true,
  )
})

test('step OFTEN and SELDOM rolls are deterministic within a turn', () => {
  const level: LevelData = {
    title: 'often-deterministic',
    width: 7,
    height: 2,
    items: [
      createItem(1, 'baba', 0, 0, false),
      ...ruleRow(3, 1, ['often', 'baba', 'is', 'you']),
    ],
  }
  const first = step(createInitialState(level, 0), 'right')
  const second = step(createInitialState(level, 0), 'right')
  assert.deepEqual(
    first.state.items.map((item) => `${item.id}:${item.x},${item.y}`),
    second.state.items.map((item) => `${item.id}:${item.x},${item.y}`),
  )
})

test('step WORD object contributes its noun to rule text', () => {
  // A word-baba standing before `is win` forms `baba is win`.
  const level: LevelData = {
    title: 'word-object',
    width: 6,
    height: 3,
    items: [
      createItem(1, 'baba', 0, 0, false),
      createItem(2, 'is', 1, 0, true),
      createItem(3, 'win', 2, 0, true),
      createItem(9, 'keke', 0, 1, false),
      ...ruleRow(4, 2, ['baba', 'is', 'word']),
      ...ruleRow(10, 1, ['keke', 'is', 'you']).map((item) => ({
        ...item,
        y: 1,
        x: item.x + 2,
      })),
    ],
  }
  const state = createInitialState(level, 0)
  const result = step(state, 'right')
  // keke (you) moves right onto... actually assert the rule formed: baba
  // gained `win` — stepping keke onto baba's row is complex; instead check
  // that baba now holds win and the level completes when keke shares the
  // cell? Simpler: baba is win + baba is word — baba itself is not you, so
  // assert the rule list contains `baba is win`.
  const formed = result.state.rules.some(
    (rule) =>
      rule.subject === 'baba' && rule.kind === 'is-property' && rule.object === 'win',
  )
  assert.equal(formed, true)
})

test('step STILL object cannot be pushed', () => {
  const level: LevelData = {
    title: 'still-block',
    width: 6,
    height: 3,
    items: [
      createItem(1, 'baba', 0, 0, false),
      createItem(2, 'rock', 1, 0, false),
      ...ruleRow(3, 1, ['baba', 'is', 'you']),
      ...ruleRow(10, 2, ['rock', 'is', 'push', 'and', 'still']),
    ],
  }
  const result = step(createInitialState(level, 0), 'right')
  assert.equal(findObject(result.state, 'baba')?.x, 0)
  assert.equal(findObject(result.state, 'rock')?.x, 1)
})

test('step SAFE object survives sink', () => {
  const level: LevelData = {
    title: 'safe-sink',
    width: 6,
    height: 3,
    items: [
      createItem(1, 'baba', 0, 0, false),
      createItem(2, 'water', 1, 0, false),
      ...ruleRow(3, 1, ['baba', 'is', 'you']),
      ...ruleRow(10, 2, ['water', 'is', 'sink', 'and', 'safe']),
    ],
  }
  const result = step(createInitialState(level, 0), 'right')
  // baba sank into the water and is gone; the safe water survives.
  assert.equal(findObject(result.state, 'water')?.x, 1)
  assert.equal(findObject(result.state, 'baba'), undefined)
  assert.equal(result.state.status, 'lose')
})

test('step BROKEN object does not move under you', () => {
  const level: LevelData = {
    title: 'broken-you',
    width: 6,
    height: 3,
    items: [
      createItem(1, 'baba', 0, 0, false),
      createItem(9, 'keke', 0, 2, false),
      ...ruleRow(3, 1, ['baba', 'is', 'you', 'and', 'broken']),
      ...ruleRow(20, 2, ['keke', 'is', 'you']).map((item) => ({
        ...item,
        x: item.x + 2,
      })),
    ],
  }
  const result = step(createInitialState(level, 0), 'right')
  assert.equal(findObject(result.state, 'baba')?.x, 0)
  assert.equal(findObject(result.state, 'keke')?.x, 1)
})

test('step 3D and YOU2 objects move like you', () => {
  const level: LevelData = {
    title: 'you-layers',
    width: 7,
    height: 4,
    items: [
      createItem(1, 'baba', 0, 0, false),
      createItem(2, 'keke', 0, 1, false),
      ...ruleRow(3, 2, ['baba', 'is', '3d']),
      ...ruleRow(10, 3, ['keke', 'is', 'you2']),
    ],
  }
  const result = step(createInitialState(level, 0), 'right')
  assert.equal(findObject(result.state, 'baba')?.x, 1)
  assert.equal(findObject(result.state, 'keke')?.x, 1)
})

test('step BONUS is picked up on you-touch without winning', () => {
  const level: LevelData = {
    title: 'bonus-pickup',
    width: 6,
    height: 3,
    items: [
      createItem(1, 'baba', 0, 0, false),
      createItem(2, 'star', 1, 0, false),
      ...ruleRow(3, 1, ['baba', 'is', 'you']),
      ...ruleRow(10, 2, ['star', 'is', 'bonus']),
    ],
  }
  const result = step(createInitialState(level, 0), 'right')
  assert.equal(result.state.status, 'playing')
  assert.equal(findObject(result.state, 'baba')?.x, 1)
  assert.equal(findObject(result.state, 'star'), undefined)
})

test('step END and DONE complete the level on you-touch', () => {
  const endLevel: LevelData = {
    title: 'end-touch',
    width: 6,
    height: 3,
    items: [
      createItem(1, 'baba', 0, 0, false),
      createItem(2, 'flag', 1, 0, false),
      ...ruleRow(3, 1, ['baba', 'is', 'you']),
      ...ruleRow(10, 2, ['flag', 'is', 'end']),
    ],
  }
  assert.equal(step(createInitialState(endLevel, 0), 'right').state.status, 'win')

  const doneLevel: LevelData = {
    title: 'done-touch',
    width: 6,
    height: 3,
    items: [
      createItem(1, 'baba', 0, 0, false),
      createItem(2, 'flag', 1, 0, false),
      ...ruleRow(3, 1, ['baba', 'is', 'you']),
      ...ruleRow(10, 2, ['flag', 'is', 'done']),
    ],
  }
  assert.equal(
    step(createInitialState(doneLevel, 0), 'right').state.status,
    'win',
  )
})

test('step PHANTOM object lets you walk through', () => {
  const level: LevelData = {
    title: 'phantom-passthrough',
    width: 6,
    height: 3,
    items: [
      createItem(1, 'baba', 0, 0, false),
      createItem(2, 'wall', 1, 0, false),
      ...ruleRow(3, 1, ['baba', 'is', 'you']),
      ...ruleRow(10, 2, ['wall', 'is', 'stop', 'and', 'phantom']),
    ],
  }
  const result = step(createInitialState(level, 0), 'right')
  assert.equal(findObject(result.state, 'baba')?.x, 1)
})

test('step LOCKEDRIGHT blocks movement right but not other directions', () => {
  const level: LevelData = {
    title: 'locked-right',
    width: 6,
    height: 3,
    items: [
      createItem(1, 'baba', 2, 0, false),
      ...ruleRow(3, 1, ['baba', 'is', 'you', 'and', 'lockedright']),
    ],
  }
  const right = step(createInitialState(level, 0), 'right')
  assert.equal(findObject(right.state, 'baba')?.x, 2)
  const left = step(createInitialState(level, 0), 'left')
  assert.equal(findObject(left.state, 'baba')?.x, 1)
})

test('step FALLUP rises until blocked', () => {
  const level: LevelData = {
    title: 'fall-up',
    width: 5,
    height: 4,
    items: [
      createItem(1, 'baba', 4, 3, false),
      ...ruleRow(3, 0, ['baba', 'is', 'fallup']),
    ],
  }
  const result = step(createInitialState(level, 0), null)
  assert.equal(findObject(result.state, 'baba')?.y, 0)
})

test('step AUTO moves without direction input', () => {
  const level: LevelData = {
    title: 'auto-move',
    width: 6,
    height: 2,
    items: [
      createItem(1, 'baba', 0, 0, false, 'right'),
      ...ruleRow(3, 1, ['baba', 'is', 'auto']),
    ],
  }
  const result = step(createInitialState(level, 0), null)
  assert.equal(findObject(result.state, 'baba')?.x, 1)
})

test('step TURN rotates facing each step', () => {
  const level: LevelData = {
    title: 'turn-rotate',
    width: 6,
    height: 2,
    items: [
      createItem(1, 'baba', 0, 0, false, 'up'),
      ...ruleRow(3, 1, ['baba', 'is', 'turn']),
    ],
  }
  const result = step(createInitialState(level, 0), null)
  assert.equal(findObject(result.state, 'baba')?.dir, 'right')
})

test('step BOOM destroys its neighbourhood', () => {
  const level: LevelData = {
    title: 'boom',
    width: 7,
    height: 3,
    items: [
      createItem(1, 'baba', 0, 0, false),
      createItem(2, 'skull', 3, 0, false),
      createItem(3, 'rock', 4, 1, false),
      createItem(4, 'wall', 4, 0, false),
      ...ruleRow(5, 1, ['baba', 'is', 'you']),
      ...ruleRow(10, 2, ['skull', 'is', 'boom']),
    ],
  }
  // skull is boom — it detonates immediately, taking its neighbours.
  const result = step(createInitialState(level, 0), null)
  assert.equal(findObject(result.state, 'skull'), undefined)
  assert.equal(findObject(result.state, 'rock'), undefined)
  assert.equal(findObject(result.state, 'wall'), undefined)
  assert.equal(findObject(result.state, 'baba')?.x, 0)
})

test('step GROUP2 membership works like group', () => {
  const level: LevelData = {
    title: 'group2',
    width: 7,
    height: 3,
    items: [
      createItem(1, 'baba', 0, 0, false),
      createItem(2, 'rock', 4, 0, false),
      ...ruleRow(3, 1, ['rock', 'is', 'group2']),
      ...ruleRow(10, 2, ['baba', 'is', 'you']),
      // baba nextto group2 — rock is a member, but too far to matter;
      // check the noun resolves by making group2 pushable.
      ...ruleRow(20, 2, ['group2', 'is', 'push']).map((item, i) => ({
        ...item,
        id: 30 + i,
        x: item.x + 4,
      })),
    ],
  }
  const result = step(createInitialState(level, 0), 'right')
  // baba walks right; rock (group2 + push) is pushed when reached — take
  // two more steps.
  const two = step(result.state, 'right')
  const three = step(two.state, 'right')
  const four = step(three.state, 'right')
  assert.equal(findObject(four.state, 'rock')?.x, 5)
  assert.equal(findObject(four.state, 'baba')?.x, 4)
})

test('step FOLLOW aims the subject at the nearest target without moving it', () => {
  const level: LevelData = {
    title: 'follow',
    width: 7,
    height: 3,
    items: [
      createItem(1, 'baba', 0, 0, false),
      createItem(2, 'keke', 4, 0, false, 'right'),
      ...ruleRow(3, 1, ['baba', 'is', 'you']),
      ...ruleRow(10, 2, ['keke', 'follow', 'baba']),
    ],
  }
  // Officially FOLLOW is aim-only (`updatedir` in moveblock): keke turns
  // to face baba but stays put.
  const one = step(createInitialState(level, 0), null)
  assert.equal(findObject(one.state, 'keke')?.x, 4)
  assert.equal(findObject(one.state, 'keke')?.dir, 'left')
})

test('step FOLLOW steers a MOVE unit toward its target', () => {
  const level: LevelData = {
    title: 'follow-move',
    width: 7,
    height: 3,
    items: [
      createItem(1, 'baba', 0, 0, false),
      createItem(2, 'keke', 4, 0, false, 'right'),
      ...ruleRow(3, 1, ['baba', 'is', 'you']),
      ...ruleRow(10, 2, ['keke', 'follow', 'baba']),
      ...ruleRow(15, 1, ['keke', 'is', 'move']),
    ],
  }
  // The aim lands before the move take: keke chases baba leftward even
  // though it started facing right.
  const one = step(createInitialState(level, 0), null)
  assert.equal(findObject(one.state, 'keke')?.x, 3)
  const two = step(one.state, null)
  assert.equal(findObject(two.state, 'keke')?.x, 2)
})

test('step FEAR flees an adjacent feared unit and stays otherwise', () => {
  const adjacent: LevelData = {
    title: 'fear-adjacent',
    width: 7,
    height: 3,
    items: [
      createItem(1, 'baba', 2, 0, false),
      createItem(2, 'keke', 3, 0, false, 'right'),
      ...ruleRow(3, 1, ['keke', 'fear', 'baba']),
    ],
  }
  // baba sits on keke's left — keke flees right.
  const result = step(createInitialState(adjacent, 0), null)
  assert.equal(findObject(result.state, 'keke')?.x, 4)

  const distant: LevelData = {
    title: 'fear-distant',
    width: 7,
    height: 3,
    items: [
      createItem(1, 'baba', 0, 2, false),
      createItem(2, 'keke', 3, 0, false, 'right'),
      ...ruleRow(3, 1, ['keke', 'fear', 'baba']),
    ],
  }
  const far = step(createInitialState(distant, 0), null)
  assert.equal(findObject(far.state, 'keke')?.x, 3)
})

test('step FEAR moves once per feared word in the max direction', () => {
  // Official `findfears` returns `amount = maxfear` — fearing two
  // different words stacked on one cell flees two cells, not one.
  const level: LevelData = {
    title: 'fear-multistep',
    width: 8,
    height: 3,
    items: [
      createItem(1, 'keke', 5, 1, false, 'right'),
      createItem(2, 'skull', 6, 1, false),
      createItem(3, 'ghost', 6, 1, false),
      ...ruleRow(10, 0, ['keke', 'fear', 'skull']),
      ...ruleRow(20, 2, ['keke', 'fear', 'ghost']),
    ],
  }
  const result = step(createInitialState(level, 0), null)
  assert.equal(findObject(result.state, 'keke')?.x, 3)
})

test('step STILL units turn toward the flee direction without moving', () => {
  // `cantmove` blocks the move but official `updatedir` still applies.
  const level: LevelData = {
    title: 'fear-still',
    width: 8,
    height: 3,
    items: [
      createItem(1, 'keke', 5, 1, false, 'right'),
      createItem(2, 'skull', 6, 1, false),
      ...ruleRow(10, 0, ['keke', 'fear', 'skull']),
      ...ruleRow(20, 2, ['keke', 'is', 'still']),
    ],
  }
  const result = step(createInitialState(level, 0), null)
  const keke = findObject(result.state, 'keke')
  assert.equal(keke?.x, 5)
  assert.equal(keke?.dir, 'left')
})

test('step STILL blocks self-movement from MOVE and AUTO stays put when blocked', () => {
  // `cantmove` gates `add_moving_units`: still units never self-move.
  const stillMove: LevelData = {
    title: 'still-move',
    width: 8,
    height: 3,
    items: [
      createItem(1, 'keke', 3, 1, false, 'right'),
      ...ruleRow(10, 0, ['keke', 'is', 'move']),
      ...ruleRow(20, 2, ['keke', 'is', 'still']),
    ],
  }
  const still = step(createInitialState(stillMove, 0), null)
  assert.equal(findObject(still.state, 'keke')?.x, 3)

  // `auto` is not in the official flip set (only move/chill bounce) — a
  // blocked auto unit just stays.
  const autoBlocked: LevelData = {
    title: 'auto-blocked',
    width: 8,
    height: 4,
    items: [
      createItem(1, 'keke', 4, 2, false, 'right'),
      createItem(2, 'wall', 5, 2, false),
      ...ruleRow(10, 0, ['keke', 'is', 'auto']),
      ...ruleRow(20, 3, ['wall', 'is', 'stop']),
    ],
  }
  const auto = step(createInitialState(autoBlocked, 0), null)
  const keke = findObject(auto.state, 'keke')
  assert.equal(keke?.x, 4)
  assert.equal(keke?.dir, 'right')
})

test('step MIMIC copies the target subject rules and MIMIC NOT blocks it', () => {
  const level: LevelData = {
    title: 'mimic-copy',
    width: 6,
    height: 4,
    items: [
      createItem(1, 'baba', 0, 0, false),
      createItem(2, 'keke', 1, 0, false),
      ...ruleRow(3, 1, ['baba', 'is', 'you']),
      ...ruleRow(10, 2, ['flag', 'is', 'push']),
      ...ruleRow(20, 3, ['keke', 'mimic', 'flag']),
    ],
  }
  // `flag is push` copies onto keke — baba pushes it.
  const result = step(createInitialState(level, 0), 'right')
  assert.equal(findObject(result.state, 'keke')?.x, 2)

  const protectedLevel: LevelData = {
    title: 'mimic-protected',
    width: 6,
    height: 4,
    items: [
      createItem(1, 'baba', 0, 0, false),
      createItem(2, 'keke', 1, 0, false),
      ...ruleRow(3, 1, ['baba', 'is', 'you']),
      ...ruleRow(10, 2, ['flag', 'is', 'push']),
      ...ruleRow(20, 3, ['keke', 'mimic', 'not', 'flag']),
    ],
  }
  // Protected keke never gains push — baba steps onto its cell (no
  // push/stop to collide with) and keke stays put.
  const blocked = step(createInitialState(protectedLevel, 0), 'right')
  assert.equal(findObject(blocked.state, 'keke')?.x, 1)
  assert.equal(findObject(blocked.state, 'baba')?.x, 1)
  assert.equal(
    (findObject(blocked.state, 'keke') as { props?: string[] })?.props?.includes(
      'push',
    ),
    false,
  )
})

test('step BECOME transforms and same-name become never vetoes is-transforms', () => {
  const level: LevelData = {
    title: 'become-transform',
    width: 6,
    height: 3,
    items: [
      createItem(1, 'baba', 0, 0, false),
      ...ruleRow(3, 1, ['baba', 'become', 'keke']),
    ],
  }
  const result = step(createInitialState(level, 0), null)
  assert.equal(findObject(result.state, 'baba'), undefined)
  assert.equal(findObject(result.state, 'keke')?.x, 0)

  const noVeto: LevelData = {
    title: 'become-no-veto',
    width: 6,
    height: 4,
    items: [
      createItem(1, 'keke', 0, 0, false),
      ...ruleRow(3, 1, ['keke', 'become', 'keke']),
      ...ruleRow(10, 2, ['keke', 'is', 'rock']),
    ],
  }
  const transformed = step(createInitialState(noVeto, 0), null)
  assert.equal(findObject(transformed.state, 'keke'), undefined)
  assert.equal(findObject(transformed.state, 'rock')?.x, 0)
})

test('step REVERT transforms the entity back to its original kind', () => {
  const level: LevelData = {
    title: 'revert',
    width: 6,
    height: 3,
    items: [
      createItem(1, 'baba', 0, 0, false),
      ...ruleRow(3, 1, ['baba', 'is', 'keke']),
      ...ruleRow(10, 2, ['keke', 'is', 'revert']),
    ],
  }
  // The initial transform already ran at state creation: the spawned
  // keke (ogname=baba) reverts to baba on the first step, then `baba is
  // keke` converts it again — the official two-rule oscillation.
  const first = step(createInitialState(level, 0), null)
  assert.equal(findObject(first.state, 'baba')?.x, 0)
  assert.equal(findObject(first.state, 'keke'), undefined)
  const second = step(first.state, null)
  assert.equal(findObject(second.state, 'keke')?.x, 0)
  assert.equal(findObject(second.state, 'baba'), undefined)
})

test('step NUDGELEFT self-moves each turn', () => {
  const level: LevelData = {
    title: 'nudge-left',
    width: 6,
    height: 3,
    items: [
      createItem(1, 'keke', 3, 0, false),
      ...ruleRow(3, 1, ['keke', 'is', 'nudgeleft']),
    ],
  }
  const result = step(createInitialState(level, 0), null)
  assert.equal(findObject(result.state, 'keke')?.x, 2)
})

test('step BACK rewinds a moved entity to its anchored cell', () => {
  const level: LevelData = {
    title: 'back-rewind',
    width: 7,
    height: 3,
    items: [
      createItem(1, 'baba', 0, 0, false),
      createItem(2, 'rock', 1, 0, false),
      ...ruleRow(3, 1, ['baba', 'is', 'you']),
      ...ruleRow(10, 2, ['rock', 'is', 'push', 'and', 'back']),
    ],
  }
  // baba pushes the rock to (2,0); next turn it rewinds to (1,0) and
  // stays anchored there.
  const pushed = step(createInitialState(level, 0), 'right')
  assert.equal(findObject(pushed.state, 'rock')?.x, 2)
  const rewound = step(pushed.state, null)
  assert.equal(findObject(rewound.state, 'rock')?.x, 1)
  const settled = step(rewound.state, null)
  assert.equal(findObject(settled.state, 'rock')?.x, 1)
})

test('step HOLD carries riders sharing the holder cell', () => {
  const level: LevelData = {
    title: 'hold-carry',
    width: 6,
    height: 3,
    items: [
      createItem(1, 'keke', 1, 0, false),
      createItem(2, 'rock', 1, 0, false),
      ...ruleRow(3, 1, ['keke', 'is', 'you', 'and', 'hold']),
    ],
  }
  const result = step(createInitialState(level, 0), 'right')
  assert.equal(findObject(result.state, 'keke')?.x, 2)
  assert.equal(findObject(result.state, 'rock')?.x, 2)
})

test('step REVERSE flips the mover direction', () => {
  const level: LevelData = {
    title: 'reverse',
    width: 6,
    height: 3,
    items: [
      createItem(1, 'baba', 2, 0, false),
      ...ruleRow(3, 1, ['baba', 'is', 'you', 'and', 'reverse']),
    ],
  }
  const result = step(createInitialState(level, 0), 'right')
  assert.equal(findObject(result.state, 'baba')?.x, 1)
})

test('step PLAY parses as an inert audio verb and WRITE emits letter text', () => {
  const level: LevelData = {
    title: 'play-write',
    width: 6,
    height: 3,
    items: [
      createItem(1, 'baba', 0, 0, false),
      ...ruleRow(3, 1, ['piano', 'play', 'c']),
      ...ruleRow(10, 2, ['baba', 'write', 'a']),
    ],
  }
  const result = step(createInitialState(level, 0), 'right')
  assert.equal(
    result.state.rules.some(
      (rule) => rule.kind === 'play' && rule.object === 'c',
    ),
    true,
  )
  const letter = result.state.items.find(
    (item) => item.isText && item.name === 'a',
  )
  assert.notEqual(letter, undefined)
})

test('step LEVEL IS WIN wins when a you unit touches the border', () => {
  const level: LevelData = {
    title: 'level-win',
    width: 5,
    height: 4,
    items: [
      createItem(1, 'baba', 0, 1, false),
      ...ruleRow(3, 2, ['baba', 'is', 'you']),
      ...ruleRow(10, 3, ['level', 'is', 'win']),
    ],
  }
  // Pressing left keeps baba pinned to the left edge — the win contact.
  const result = step(createInitialState(level, 0), 'left')
  assert.equal(result.state.status, 'win')
})

test('step LEVEL IS WIN wins with a you unit anywhere (global contact)', () => {
  // Officially the level entity touches the whole room — `level is win`
  // plus any live `you` wins regardless of position.
  const level: LevelData = {
    title: 'level-win-mid',
    width: 5,
    height: 4,
    items: [
      createItem(1, 'baba', 2, 2, false),
      ...ruleRow(3, 0, ['baba', 'is', 'you']),
      ...ruleRow(10, 3, ['level', 'is', 'win']),
    ],
  }
  const result = step(createInitialState(level, 0), 'left')
  assert.equal(result.state.status, 'win')
})

test('step LEVEL IS DEFEAT kills a you unit on the border', () => {
  const level: LevelData = {
    title: 'level-defeat',
    width: 5,
    height: 4,
    items: [
      createItem(1, 'baba', 4, 1, false),
      ...ruleRow(3, 0, ['baba', 'is', 'you']),
      ...ruleRow(10, 3, ['level', 'is', 'defeat']),
    ],
  }
  const result = step(createInitialState(level, 0), 'right')
  assert.equal(findObject(result.state, 'baba'), undefined)
  assert.equal(result.state.status, 'lose')
})

test('step LEVEL IS HOT melts and LEVEL IS OPEN unlocks at the border', () => {
  const level: LevelData = {
    title: 'level-hot-open',
    width: 7,
    height: 4,
    items: [
      createItem(1, 'baba', 2, 2, false),
      createItem(2, 'ice', 0, 0, false),
      createItem(3, 'door', 6, 3, false),
      ...ruleRow(4, 1, ['baba', 'is', 'you']),
      ...ruleRow(10, 2, ['ice', 'is', 'melt']),
      ...ruleRow(14, 2, ['door', 'is', 'shut']),
      ...ruleRow(20, 3, ['level', 'is', 'hot']),
      ...ruleRow(24, 3, ['level', 'is', 'open']),
    ],
  }
  const result = step(createInitialState(level, 0), 'left')
  // Border ice melts against the hot frame; border door unlocks.
  assert.equal(findObject(result.state, 'ice'), undefined)
  assert.equal(findObject(result.state, 'door'), undefined)
  // Baba in the middle is untouched.
  assert.notEqual(findObject(result.state, 'baba'), undefined)
})

test('step LEVEL IS HOLD pins border units but leaves inner ones free', () => {
  const level: LevelData = {
    title: 'level-hold',
    width: 5,
    height: 5,
    items: [
      createItem(1, 'baba', 0, 2, false),
      createItem(2, 'keke', 2, 3, false),
      ...ruleRow(4, 0, ['baba', 'is', 'you'], 1),
      ...ruleRow(8, 2, ['keke', 'is', 'move'], 1),
      ...ruleRow(12, 4, ['level', 'is', 'hold'], 1),
    ],
  }
  const result = step(createInitialState(level, 0), 'down')
  // Baba hugs the frame with a clear cell below — only the hold pin can
  // stop the move.
  assert.equal(findObject(result.state, 'baba')?.y, 2)
  // Keke (auto-moving right from (2,3)) is off the frame and moves freely.
  assert.equal(findObject(result.state, 'keke')?.x, 3)
})

test('step STILL blocks player movement but still turns the unit', () => {
  // Official `cantmove` gates the `you` take too: a still you-unit does
  // `updatedir` only — it faces the input without leaving its cell.
  const level: LevelData = {
    title: 'still-self-move',
    width: 6,
    height: 3,
    items: [
      createItem(1, 'baba', 1, 1, false),
      ...ruleRow(3, 0, ['baba', 'is', 'you']),
      ...ruleRow(7, 2, ['baba', 'is', 'still']),
    ],
  }
  const result = step(createInitialState(level, 0), 'right')
  const baba = findObject(result.state, 'baba')
  assert.equal(baba?.x, 1)
  assert.equal(baba?.dir, 'right')
})

test('step HOLD does not carry STILL riders', () => {
  const level: LevelData = {
    title: 'hold-still-rider',
    width: 8,
    height: 6,
    items: [
      createItem(1, 'baba', 3, 2, false),
      createItem(2, 'wall', 3, 2, false),
      ...ruleRow(4, 0, ['wall', 'is', 'hold']),
      ...ruleRow(8, 1, ['wall', 'is', 'move']),
      ...ruleRow(12, 4, ['baba', 'is', 'still']),
      ...ruleRow(16, 5, ['baba', 'is', 'you']),
    ],
  }
  const result = step(createInitialState(level, 0), null)
  // The wall moved right on its own; carrying is an external force, so
  // the still baba stays on the vacated cell.
  assert.equal(findObject(result.state, 'wall')?.x, 4)
  assert.equal(findObject(result.state, 'baba')?.x, 3)
})

test('step LEVEL IS FLOAT moves the border contact onto the float layer', () => {
  const base = (): LevelData => ({
    title: 'level-float-defeat',
    width: 5,
    height: 4,
    items: [
      createItem(1, 'baba', 4, 1, false),
      ...ruleRow(3, 0, ['baba', 'is', 'you']),
      ...ruleRow(7, 0, ['baba', 'is', 'float']),
      ...ruleRow(11, 3, ['level', 'is', 'defeat']),
      ...ruleRow(15, 3, ['level', 'is', 'float']),
    ],
  })
  // Floating you on the frame contacts the floating level → dies.
  const floating = step(createInitialState(base(), 0), 'right')
  assert.equal(findObject(floating.state, 'baba'), undefined)

  const grounded: LevelData = {
    title: 'level-float-defeat-grounded',
    width: 5,
    height: 4,
    items: [
      createItem(1, 'baba', 4, 1, false),
      ...ruleRow(3, 0, ['baba', 'is', 'you']),
      ...ruleRow(10, 3, ['level', 'is', 'defeat']),
      ...ruleRow(14, 3, ['level', 'is', 'float']),
    ],
  }
  // Grounded you on the frame does not touch the floating level → lives.
  const result = step(createInitialState(grounded, 0), 'right')
  assert.notEqual(findObject(result.state, 'baba'), undefined)
})

test('step EMPTY IS YOU pushes units standing in front of empty cells', () => {
  const level: LevelData = {
    title: 'empty-you-push',
    width: 5,
    height: 4,
    items: [
      createItem(1, 'baba', 1, 1, false),
      createItem(2, 'keke', 3, 2, false),
      ...ruleRow(4, 0, ['baba', 'is', 'push']),
      ...ruleRow(8, 3, ['empty', 'is', 'you']),
    ],
  }
  // Pressing right: the empty cell at (0,1) pushes baba right.
  const result = step(createInitialState(level, 0), 'right')
  assert.equal(findObject(result.state, 'baba')?.x, 2)
  // Keke is not pushable — the empty cell next to it cannot move it.
  assert.equal(findObject(result.state, 'keke')?.x, 3)
})

test('step EMPTY IS YOU + EMPTY IS SWAP trades places with occupants', () => {
  const level: LevelData = {
    title: 'empty-you-swap',
    width: 5,
    height: 4,
    items: [
      createItem(1, 'baba', 1, 1, false),
      ...ruleRow(3, 0, ['empty', 'is', 'you']),
      ...ruleRow(7, 3, ['empty', 'is', 'swap']),
    ],
  }
  // Pressing right: the empty cell at (0,1) swaps with baba at (1,1) —
  // the occupant slides opposite to the input direction.
  const result = step(createInitialState(level, 0), 'right')
  assert.equal(findObject(result.state, 'baba')?.x, 0)
})

test('step EMPTY IS MOVE pushes units in the emptydir direction', () => {
  const level: LevelData = {
    title: 'empty-move',
    width: 5,
    height: 4,
    items: [
      createItem(1, 'baba', 1, 1, false),
      ...ruleRow(3, 0, ['baba', 'is', 'push']),
      ...ruleRow(7, 2, ['empty', 'is', 'move']),
      ...ruleRow(11, 3, ['empty', 'is', 'right']),
    ],
  }
  // No input needed: the empty cell left of baba pushes it right.
  const result = step(createInitialState(level, 0), 'down')
  assert.equal(findObject(result.state, 'baba')?.x, 2)
})

test('step EMPTY IS MOVE without a direction rule does nothing', () => {
  const level: LevelData = {
    title: 'empty-move-nodir',
    width: 5,
    height: 4,
    items: [
      createItem(1, 'baba', 1, 1, false),
      ...ruleRow(3, 0, ['baba', 'is', 'push']),
      ...ruleRow(7, 3, ['empty', 'is', 'move']),
    ],
  }
  const result = step(createInitialState(level, 0), 'down')
  assert.equal(findObject(result.state, 'baba')?.x, 1)
})

// Rule text must sit off the border too — the frame counts every unit.
const innerRow = (
  startId: number,
  x: number,
  y: number,
  words: string[],
): LevelItem[] =>
  words.map((word, index) => createItem(startId + index, word, x + index, y, true))

test('step LEVEL IS WEAK destroys the level on border contact', () => {
  const level: LevelData = {
    title: 'level-weak',
    width: 7,
    height: 6,
    items: [
      createItem(1, 'baba', 0, 2, false),
      ...innerRow(3, 1, 1, ['baba', 'is', 'you']),
      ...innerRow(7, 1, 4, ['level', 'is', 'weak']),
    ],
  }
  const result = step(createInitialState(level, 0), 'left')
  assert.equal(findObject(result.state, 'baba'), undefined)
  assert.equal(result.state.status, 'lose')
})

test('step LEVEL IS WEAK destroys the level while any unit exists', () => {
  // Officially `level is weak` destroys the room the moment any unit on
  // its float layer exists — including the rule text itself — so the
  // unconditional rule always self-destructs (official levels only ever
  // use it conditionally, e.g. `without`).
  const level: LevelData = {
    title: 'level-weak-mid',
    width: 7,
    height: 6,
    items: [
      createItem(1, 'baba', 3, 3, false),
      ...innerRow(3, 1, 1, ['baba', 'is', 'you']),
      ...innerRow(7, 1, 4, ['level', 'is', 'weak']),
    ],
  }
  const result = step(createInitialState(level, 0), 'up')
  assert.equal(result.state.status, 'lose')
})

test('step LEVEL IS WEAK WITHOUT stays alive while the unit exists', () => {
  // `level is weak without flag`: flag on the board suppresses the rule
  // (official `testcond` — `without` checks the whole map).
  const level: LevelData = {
    title: 'level-weak-without',
    width: 7,
    height: 6,
    items: [
      createItem(1, 'baba', 3, 3, false),
      createItem(2, 'flag', 5, 3, false),
      ...innerRow(3, 1, 1, ['baba', 'is', 'you']),
      ...innerRow(7, 1, 4, ['level', 'without', 'flag', 'is', 'weak']),
    ],
  }
  const alive = step(createInitialState(level, 0), 'up')
  assert.notEqual(findObject(alive.state, 'baba'), undefined)
  assert.equal(alive.state.status, 'playing')
})

test('step LEVEL IS YOU scrolls the room offset without moving units', () => {
  const level: LevelData = {
    title: 'level-you-scroll',
    width: 7,
    height: 6,
    items: [
      createItem(1, 'baba', 3, 3, false),
      ...innerRow(3, 1, 1, ['level', 'is', 'you']),
    ],
  }
  const initial = createInitialState(level, 0)
  const result = step(initial, 'right')
  // The room scrolled one cell right; logical positions stay put and
  // mapdir (levelDir) now faces right.
  assert.equal(result.state.levelOffset?.x, 1)
  assert.equal(result.state.levelOffset?.y, 0)
  assert.equal(result.state.levelDir, 'right')
  assert.equal(findObject(result.state, 'baba')?.x, 3)
  // Second scroll wraps the offset around the board width.
  let state = result.state
  for (let i = 0; i < 6; i += 1) state = step(state, 'right').state
  assert.equal(state.levelOffset?.x, 0)
})

test('step LEVEL IS STILL blocks the scroll; MOVE rides the level dir', () => {
  const level: LevelData = {
    title: 'level-still',
    width: 7,
    height: 6,
    items: [
      createItem(1, 'baba', 3, 3, false),
      ...innerRow(3, 1, 1, ['level', 'is', 'you']),
      ...innerRow(7, 1, 4, ['level', 'is', 'still']),
    ],
  }
  const result = step(createInitialState(level, 0), 'right')
  assert.equal(result.state.levelOffset, undefined)

  const moving: LevelData = {
    title: 'level-move',
    width: 7,
    height: 6,
    items: [
      createItem(1, 'baba', 3, 3, false),
      ...innerRow(3, 1, 1, ['level', 'is', 'move']),
      ...innerRow(7, 1, 4, ['level', 'is', 'left']),
    ],
  }
  // `level is left` faces the room left; `level is move` scrolls along it.
  const rolled = step(createInitialState(moving, 0), 'right')
  assert.equal(rolled.state.levelDir, 'left')
  assert.equal(rolled.state.levelOffset?.x, 6)
})

test('step LEVEL IS DEFEAT kills you units anywhere (global contact)', () => {
  // Officially `level is defeat` is global — the level entity touches
  // every unit on its float layer, not just border ones.
  const level: LevelData = {
    title: 'level-defeat-global',
    width: 7,
    height: 6,
    items: [
      createItem(1, 'baba', 3, 3, false),
      createItem(2, 'keke', 5, 4, false),
      ...innerRow(3, 1, 1, ['baba', 'is', 'you']),
      ...innerRow(7, 1, 4, ['keke', 'is', 'you']),
      ...innerRow(12, 3, 4, ['level', 'is', 'defeat']),
    ],
  }
  const result = step(createInitialState(level, 0), 'up')
  assert.equal(findObject(result.state, 'baba'), undefined)
  assert.equal(findObject(result.state, 'keke'), undefined)
  assert.equal(result.state.status, 'lose')
})

test('step LEVEL IS YOU + X IS DEFEAT destroys the level', () => {
  // The level-as-you touches every defeat source on the board.
  const level: LevelData = {
    title: 'level-you-defeat',
    width: 7,
    height: 6,
    items: [
      createItem(1, 'baba', 3, 3, false),
      createItem(2, 'skull', 5, 4, false),
      ...innerRow(3, 1, 1, ['baba', 'is', 'you']),
      ...innerRow(7, 1, 4, ['skull', 'is', 'defeat']),
      ...innerRow(12, 3, 5, ['level', 'is', 'you']),
    ],
  }
  const result = step(createInitialState(level, 0), 'up')
  assert.equal(result.state.status, 'lose')
})

test('step LEVEL IS YOU + X IS WIN wins without contact', () => {
  const level: LevelData = {
    title: 'level-you-win',
    width: 7,
    height: 6,
    items: [
      createItem(1, 'baba', 3, 3, false),
      createItem(2, 'flag', 5, 4, false),
      ...innerRow(3, 1, 1, ['flag', 'is', 'win']),
      ...innerRow(7, 1, 4, ['level', 'is', 'you']),
    ],
  }
  const result = step(createInitialState(level, 0), 'up')
  assert.equal(result.state.status, 'win')
})

test('step LEVEL EAT X swallows every matching unit', () => {
  const level: LevelData = {
    title: 'level-eat',
    width: 7,
    height: 6,
    items: [
      createItem(1, 'baba', 3, 3, false),
      createItem(2, 'rock', 5, 4, false),
      createItem(3, 'rock', 1, 4, false),
      ...innerRow(4, 1, 1, ['baba', 'is', 'you']),
      ...innerRow(8, 1, 4, ['level', 'eat', 'rock']),
    ],
  }
  const result = step(createInitialState(level, 0), 'up')
  assert.equal(
    result.state.items.filter((i) => i.name === 'rock' && !i.isText).length,
    0,
  )
  assert.notEqual(findObject(result.state, 'baba'), undefined)
  assert.equal(result.state.status, 'playing')
})

test('step X EAT LEVEL destroys the room', () => {
  const level: LevelData = {
    title: 'eat-level',
    width: 7,
    height: 6,
    items: [
      createItem(1, 'baba', 3, 3, false),
      ...innerRow(3, 1, 1, ['baba', 'is', 'you']),
      ...innerRow(7, 1, 4, ['baba', 'eat', 'level']),
    ],
  }
  const result = step(createInitialState(level, 0), 'up')
  assert.equal(result.state.status, 'lose')
})

test('step LEVEL IS SHIFT moves every unit along levelDir', () => {
  const level: LevelData = {
    title: 'level-shift',
    width: 7,
    height: 6,
    items: [
      createItem(1, 'baba', 3, 3, false),
      createItem(2, 'rock', 5, 4, false),
      ...innerRow(4, 1, 1, ['baba', 'is', 'you']),
      ...innerRow(8, 1, 4, ['level', 'is', 'shift']),
    ],
  }
  // No input: the default mapdir is down, so both units slide down.
  const result = step(createInitialState(level, 0), null)
  assert.equal(findObject(result.state, 'baba')?.y, 4)
  assert.equal(findObject(result.state, 'rock')?.y, 5)
})

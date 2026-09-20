import { resolveEmptyPropsByCell } from './empty.js'
import { applyProperties } from './resolve.js'
import { collectRuleRuntime, createRuleRuntime } from './rule-runtime.js'
import { STEP_STAGES } from './step/phase-list.js'
import { advanceLevelRoom, levelPushPullDelta } from './step/shared.js'
import { checkWin, hasAnyYou } from './step/win.js'

import type { RuleRuntime } from './rule-runtime.js'
import type {
  StepPhaseItems,
  StepStage,
  StepStageContext,
  StepStageSync,
} from './step/phase-list.js'
import type {
  Direction,
  GameState,
  Item,
  LevelItem,
  StepResult,
} from './types.js'

type StepFrame = {
  items: Item[]
  runtime: RuleRuntime
  // The items the frame's rules were parsed from — carried so the produced
  // state can answer "would reparsing give the same rules?" next step.
  ruleSourceItems: StepPhaseItems
}

const itemSignature = (item: Item): string =>
  `${item.name}@${item.x},${item.y}${item.isText ? '!' : ''}${item.dir ?? ''}(${[...item.props].sort().join('+')})`

const sameItemFields = (a: Item, b: Item): boolean =>
  a === b ||
  (a.name === b.name &&
  a.x === b.x &&
  a.y === b.y &&
  a.isText === b.isText &&
  a.dir === b.dir &&
  (a.props === b.props ||
    (a.props.length === b.props.length &&
      a.props.every((prop, index) => prop === b.props[index]))))

const sameItems = (before: Item[], after: Item[]): boolean => {
  if (before === after) return true
  if (before.length !== after.length) return false

  // Order-identical fast path: stage pipelines keep survivors in place and
  // append spawns, so a net-unchanged step usually yields a field-equal
  // sequence — comparing fields avoids building any signature strings.
  let ordered = true
  for (let index = 0; index < before.length; index += 1) {
    const a = before[index]
    const b = after[index]
    if (!a || !b || !sameItemFields(a, b)) {
      ordered = false
      break
    }
  }
  if (ordered) return true

  const counts = new Map<string, number>()
  for (const item of before) {
    const key = itemSignature(item)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  for (const item of after) {
    const key = itemSignature(item)
    const left = (counts.get(key) ?? 0) - 1
    if (left < 0) return false
    counts.set(key, left)
  }
  return true
}

// Rule collection reads only parser-visible items — text cards and
// `word`-prop units acting as their noun (`collectRuleInstances` skips the
// rest before touching positions). Comparing just that subsequence, in
// order, on id (overridden cards are keyed by it), name, position and
// isText reproduces the parser's input exactly; plain units may move,
// spawn or vanish without disturbing the stored rules.
const isRuleVisible = (item: LevelItem): boolean =>
  item.isText ||
  ('props' in item &&
    Array.isArray(item.props) &&
    (item.props as string[]).includes('word'))

const sameRuleInputs = (
  a: readonly LevelItem[],
  b: readonly LevelItem[],
): boolean => {
  if (a === b) return true
  let i = 0
  let j = 0
  while (true) {
    while (i < a.length && !isRuleVisible(a[i] as LevelItem)) i += 1
    while (j < b.length && !isRuleVisible(b[j] as LevelItem)) j += 1
    const x = a[i]
    const y = b[j]
    if (!x || !y) return !x && !y
    if (
      x.id !== y.id ||
      x.name !== y.name ||
      x.x !== y.x ||
      x.y !== y.y ||
      x.isText !== y.isText
    )
      return false
    i += 1
    j += 1
  }
}

const contextExtras = (
  runtime: RuleRuntime,
): { idle?: boolean; turn?: number } => ({
  ...(runtime.context.idle !== undefined ? { idle: runtime.context.idle } : {}),
  ...(runtime.context.turn !== undefined ? { turn: runtime.context.turn } : {}),
})

const resolveFrame = (
  items: StepPhaseItems,
  width: number,
  height: number,
  extras?: { idle?: boolean; turn?: number },
): StepFrame => {
  const runtime = collectRuleRuntime(items, width, height, extras)
  return {
    items: applyProperties(items, runtime),
    runtime,
    ruleSourceItems: items,
  }
}

const rebindFrameWithSameRules = (
  items: Item[],
  frame: StepFrame,
): StepFrame => {
  const reboundRuntime = createRuleRuntime(
    items,
    frame.runtime.rules,
    frame.runtime.width,
    frame.runtime.height,
    frame.runtime.overriddenTextIds,
    contextExtras(frame.runtime),
  )
  return {
    items,
    runtime: reboundRuntime,
    ruleSourceItems: frame.ruleSourceItems,
  }
}

const refreshProperties = (
  items: StepPhaseItems,
  frame: StepFrame,
): StepFrame => {
  const reboundRuntime = createRuleRuntime(
    items,
    frame.runtime.rules,
    frame.runtime.width,
    frame.runtime.height,
    frame.runtime.overriddenTextIds,
    contextExtras(frame.runtime),
  )
  return {
    items: applyProperties(items, reboundRuntime),
    runtime: reboundRuntime,
    ruleSourceItems: frame.ruleSourceItems,
  }
}

const synchronizeStageFrame = (
  items: StepPhaseItems,
  frame: StepFrame,
  sync: Exclude<StepStageSync, { kind: 'reuse-rules' }>,
): StepFrame => {
  if (sync.kind === 'recollect-rules') {
    // The parser only sees text/`word` items — a stage that moved plain
    // units leaves the ruleset identical, so rebind instead of rescanning.
    // Mirrors `resolveFrame` exactly: no extras on the fresh context.
    if (sameRuleInputs(items, frame.ruleSourceItems)) {
      const reboundRuntime = createRuleRuntime(
        items,
        frame.runtime.rules,
        frame.runtime.width,
        frame.runtime.height,
        frame.runtime.overriddenTextIds,
      )
      return {
        items: applyProperties(items, reboundRuntime),
        runtime: reboundRuntime,
        ruleSourceItems: items,
      }
    }
    return resolveFrame(items, frame.runtime.width, frame.runtime.height)
  }

  return refreshProperties(items, frame)
}

const isReuseRulesStage = (
  stage: StepStage,
): stage is Extract<StepStage, { sync: { kind: 'reuse-rules' } }> =>
  stage.sync.kind === 'reuse-rules'

type StageOutcome = {
  frame: StepFrame
  changed: boolean
  rulesStale: boolean
}

const runStage = (
  frame: StepFrame,
  stage: StepStage,
  rulesStale: boolean,
  ctx: StepStageContext,
): StageOutcome => {
  const keepFrame = (
    items: StepPhaseItems,
    recollectable: boolean,
  ): StageOutcome => {
    if (!rulesStale || !recollectable)
      return { frame, changed: false, rulesStale }
    return {
      frame: sameRuleInputs(items, frame.ruleSourceItems)
        ? refreshProperties(items, frame)
        : resolveFrame(
            items,
            frame.runtime.width,
            frame.runtime.height,
            contextExtras(frame.runtime),
          ),
      changed: false,
      rulesStale: false,
    }
  }

  if (isReuseRulesStage(stage)) {
    const result = stage.run(frame.items, frame.runtime, ctx)
    if (!result.changed) return keepFrame(result.items, false)
    return {
      frame: rebindFrameWithSameRules(result.items, frame),
      changed: true,
      rulesStale: true,
    }
  }

  const result = stage.run(frame.items, frame.runtime, ctx)
  if (!result.changed)
    return keepFrame(result.items, stage.sync.kind === 'recollect-rules')
  return {
    frame: synchronizeStageFrame(result.items, frame, stage.sync),
    changed: true,
    rulesStale: stage.sync.kind !== 'recollect-rules',
  }
}

// `back` ("MIMIC"-like rewind): the anchor is *sticky* — `prevX/Y` stays
// where it was first set, so stepping again with `back` still active keeps
// the entity rewinding to the same cell every turn instead of chasing a
// moving window. Dropping the prop clears the anchor.
const withBackMemory = (items: Item[], previousItems: Item[]): Item[] => {
  const startPositions = new Map<number, { x: number; y: number }>()
  for (const item of previousItems)
    startPositions.set(item.id, { x: item.x, y: item.y })
  return items.map((item) => {
    if (!item.props.includes('back')) {
      if (item.prevX === undefined && item.prevY === undefined) return item
      const cleared = { ...item }
      delete cleared.prevX
      delete cleared.prevY
      return cleared
    }
    if (item.prevX !== undefined && item.prevY !== undefined) return item
    const start = startPositions.get(item.id)
    if (!start) return item
    return { ...item, prevX: start.x, prevY: start.y }
  })
}

// Frame resolution depends on direction only through the `idle` flag
// (idle conditions fire on waits). Directional siblings share the entire
// resolve — parser check, rule runtime, property application — which is
// ~18% of a step on large boards.
const resolveStepFrame = (state: GameState, idle: boolean): StepFrame => {
  const extras = { idle, turn: state.turn + 1 }
  // The stored rules were parsed from `rulesSourceItems`; when this step's
  // items still match it on every field the parser reads, reparsing would
  // produce the identical rules and override marks — bind a runtime onto
  // them directly instead.
  const source = state.rulesSourceItems
  const overridden = state.overriddenTextIds
  if (
    source !== undefined &&
    overridden !== undefined &&
    sameRuleInputs(source, state.items)
  ) {
    const runtime = createRuleRuntime(
      state.items,
      state.rules,
      state.width,
      state.height,
      overridden,
      extras,
    )
    return {
      items: applyProperties(state.items, runtime),
      runtime,
      ruleSourceItems: state.items,
    }
  }
  return resolveFrame(state.items, state.width, state.height, extras)
}

const runStages = (
  state: GameState,
  frame: StepFrame,
  direction: Direction | null,
): StepResult => {
  let rulesStale = false

  // The produced frame's index is `state.turn + 1`; the predecessor seeds
  // tele RNG with its history length, which is the same value.
  const ctx: StepStageContext = {
    direction,
    turn: state.turn + 1,
    levelDir: state.levelDir ?? 'down',
  }

  for (const stage of STEP_STAGES) {
    const stageResult = runStage(frame, stage, rulesStale, ctx)
    frame = stageResult.frame
    rulesStale = stageResult.rulesStale
  }

  // One empty-cells scan feeds both the win and the lose checks (the
  // resolver early-outs cheaply when no `empty is …` rules exist). The
  // map stays per-cell: official empty pseudo-units interact only where
  // their own props hold.
  const emptyPropsByCell = resolveEmptyPropsByCell(
    frame.runtime.rules,
    frame.items,
    state.width,
    state.height,
    frame.runtime.context,
  )
  const didWin = checkWin(
    frame.items,
    state.width,
    state.height,
    emptyPropsByCell,
    frame.runtime,
  )
  // Losing requires having had a `you` to lose: rooms that never gave the
  // player control (the official ending/interlude levels like `ba`/`ab`)
  // stay inert `playing` instead of flipping to a defeat screen on the
  // first keypress. A reached `lose` stays `lose` — recovery is the undo
  // stack's job, not the step pipeline's.
  const didLose =
    !didWin &&
    !hasAnyYou(frame.items, emptyPropsByCell) &&
    (state.status === 'lose' || hasAnyYou(state.items, emptyPropsByCell))

  // `back` bookkeeping needs the position snapshot only when some entity
  // carries the prop or a stale anchor needs clearing — most steps take
  // the identity path and skip both the map and the pass.
  const needsMemoryPass = frame.items.some(
    (item) =>
      item.props.includes('back') ||
      item.prevX !== undefined ||
      item.prevY !== undefined,
  )
  const itemsWithMemory = needsMemoryPass
    ? withBackMemory(frame.items, state.items)
    : frame.items

  // `level is you/move/…` scrolls or rotates the whole room — purely a
  // render offset (`MF_scrollroom`), so it is computed once here from the
  // final rules rather than moving any logical positions.
  const room = advanceLevelRoom(
    frame.runtime.buckets.level,
    frame.runtime.context,
    direction,
    state.levelDir ?? 'down',
    state.levelOffset ?? { x: 0, y: 0 },
    state.width,
    state.height,
    state.turn + 1,
  )
  // `level is push`/`pull`: units working against the frame move the
  // room instead — detected by comparing pre/post-step positions.
  const pushPull =
    direction === null
      ? null
      : levelPushPullDelta(
          state.items,
          itemsWithMemory,
          frame.runtime.buckets.level,
          frame.runtime.context,
          direction,
          state.width,
          state.height,
        )
  const roomOffset = pushPull
    ? {
        x:
          (((room.offset.x + pushPull.dx) % state.width) + state.width) %
          state.width,
        y:
          (((room.offset.y + pushPull.dy) % state.height) + state.height) %
          state.height,
      }
    : room.offset
  const roomChanged = room.changed || pushPull !== null

  const nextState: GameState = {
    ...state,
    items: itemsWithMemory,
    rules: frame.runtime.rules,
    overriddenTextIds: frame.runtime.overriddenTextIds,
    rulesSourceItems: frame.ruleSourceItems,
    status: didWin ? 'win' : didLose ? 'lose' : 'playing',
    turn: state.turn + 1,
    ...(roomChanged ||
    state.levelDir !== undefined ||
    state.levelOffset !== undefined
      ? { levelOffset: roomOffset, levelDir: room.dir }
      : {}),
  }

  const statusChanged =
    (state.status === 'win') !== didWin || (state.status === 'lose') !== didLose

  // changed follows net state, matching the predecessor engine: a step whose
  // stages mutated then restored the board (e.g. stepping onto a shift belt
  // that pushes straight back) must not count as a processed change — undo
  // depth, tele RNG seeding via turn, and render refresh all key off it.
  return {
    state: nextState,
    changed:
      !sameItems(state.items, itemsWithMemory) ||
      statusChanged ||
      roomChanged,
  }
}

export const step = (
  state: GameState,
  direction: Direction | null,
): StepResult =>
  runStages(state, resolveStepFrame(state, direction === null), direction)

// Sibling-expansion entry point for the solver: resolves the rule frame
// once (non-idle), then each returned call runs only the stage pipeline.
// Stages treat their input items as immutable (they copy before writing,
// e.g. move-single's `items.map(({...item}))`), so sharing the prepared
// frame across calls is safe. Waits are NOT covered — `idle` flips rule
// matching, so `step(state, null)` remains the only correct wait.
export const prepareStep = (
  state: GameState,
): ((direction: Direction) => StepResult) => {
  const frame = resolveStepFrame(state, false)
  return (direction) => runStages(state, frame, direction)
}

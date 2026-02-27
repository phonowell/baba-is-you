import type { Item } from '../logic/types.js'

const STACK_MOVE_FALL_PROPS = new Set<Item['props'][number]>(['move', 'fall'])
const STACK_PUSH_PULL_PROPS = new Set<Item['props'][number]>(['push', 'pull'])
const STACK_OPEN_SHUT_PROPS = new Set<Item['props'][number]>(['open', 'shut'])
const GROUND_HUG_NAMES = new Set(['tile', 'water', 'belt'])

export const STACK_LAYER_PRIORITY = {
  you: 5,
  text: 4,
  moveFall: 3,
  pushPull: 2,
  openShut: 1,
  other: 0,
} as const

export const isGroundHugItem = (item: Item): boolean =>
  !item.isText && GROUND_HUG_NAMES.has(item.name)

export const stackLayerPriorityForItem = (item: Item): number => {
  if (item.props.includes('you')) return STACK_LAYER_PRIORITY.you
  if (item.isText) return STACK_LAYER_PRIORITY.text
  if (item.props.some((prop) => STACK_MOVE_FALL_PROPS.has(prop)))
    return STACK_LAYER_PRIORITY.moveFall
  if (item.props.some((prop) => STACK_PUSH_PULL_PROPS.has(prop)))
    return STACK_LAYER_PRIORITY.pushPull
  if (item.props.some((prop) => STACK_OPEN_SHUT_PROPS.has(prop)))
    return STACK_LAYER_PRIORITY.openShut
  return STACK_LAYER_PRIORITY.other
}

const byStableId = (left: Item, right: Item): number => left.id - right.id

const byUprightPriorityDesc = (left: Item, right: Item): number => {
  const priorityDiff =
    stackLayerPriorityForItem(right) - stackLayerPriorityForItem(left)
  if (priorityDiff !== 0) return priorityDiff
  return byStableId(left, right)
}

export const sortUprightStack = (items: Item[]): Item[] =>
  items.filter((item) => !isGroundHugItem(item)).sort(byUprightPriorityDesc)

export const sortGroundStack = (items: Item[]): Item[] =>
  items.filter((item) => isGroundHugItem(item)).sort(byStableId)

export const sortRenderStack = (items: Item[]): Item[] => [
  ...sortUprightStack(items),
  ...sortGroundStack(items),
]

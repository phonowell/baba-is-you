export type Direction = 'up' | 'right' | 'down' | 'left'

export type Property =
  | 'you'
  | 'win'
  | 'stop'
  | 'push'
  | 'move'
  | 'open'
  | 'shut'
  | 'defeat'
  | 'sink'
  | 'hot'
  | 'melt'
  | 'weak'
  | 'float'
  | 'tele'
  | 'pull'
  | 'shift'
  | 'swap'
  | 'up'
  | 'right'
  | 'down'
  | 'left'
  | 'red'
  | 'blue'
  | 'best'

export type RuleKind = 'property' | 'transform' | 'has'

export type Rule = {
  subject: string
  subjectNegated?: boolean
  object: string
  objectNegated?: boolean
  kind: RuleKind
}

export type LevelItem = {
  id: number
  name: string
  x: number
  y: number
  isText: boolean
  dir?: Direction
}

export type Item = LevelItem & {
  props: Property[]
}

export type LevelData = {
  title: string
  width: number
  height: number
  items: LevelItem[]
}

export type GameStatus = 'playing' | 'win' | 'lose' | 'complete'

export type GameState = {
  levelIndex: number
  title: string
  width: number
  height: number
  items: Item[]
  rules: Rule[]
  status: GameStatus
  turn: number
}

export type StepResult = {
  state: GameState
  changed: boolean
}

export const CORE_PROPERTIES: Property[] = [
  'you',
  'win',
  'stop',
  'push',
  'move',
  'open',
  'shut',
  'defeat',
  'sink',
  'hot',
  'melt',
  'weak',
  'float',
  'tele',
  'pull',
  'shift',
  'swap',
  'up',
  'right',
  'down',
  'left',
  'red',
  'blue',
  'best',
]

export const DIRECTIONS: Direction[] = ['up', 'right', 'down', 'left']

export const PROPERTY_WORDS = new Set<string>(CORE_PROPERTIES)

export const TEXT_WORDS = new Set<string>([
  ...CORE_PROPERTIES,
  'is',
  'and',
  'has',
  'not',
  'text',
  'empty',
])

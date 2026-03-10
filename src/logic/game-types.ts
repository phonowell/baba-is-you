import type { Direction, Property, Rule } from './types.js'

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

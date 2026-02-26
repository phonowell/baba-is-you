export type ParsedItem = {
  dir?: 'up' | 'right' | 'down' | 'left'
  isText: boolean
  name: string
}

export type LegendEntry = {
  items: ParsedItem[]
  topNoun: string | null
}

export type PlacedItem = ParsedItem & {
  x: number
  y: number
}

export type ConvertedLevel = {
  body: string
  source: string
}

export type StopResult = {
  file: string
  reason: string
}

export type MetaEntry = {
  key: string
  value: string
}

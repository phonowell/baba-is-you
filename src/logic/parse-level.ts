import type { LevelData, LevelItem } from './types.js'

const SIZE_RE = /^(\d+)x(\d+)$/i
const DIRECTION_SUFFIX_RE = /^(.*)@(up|right|down|left)$/i

export const parseLevel = (levelText: string): LevelData => {
  const items: LevelItem[] = []
  let title = 'Untitled'
  let width = 0
  let height = 0
  let nextId = 1

  const parts = levelText.split(';')
  for (const part of parts) {
    const trimmed = part.trim()
    if (!trimmed) continue

    const tokens = trimmed.split(/\s+/)
    const key = tokens.shift()
    if (!key) continue

    const lowerKey = key.toLowerCase()

    if (lowerKey === 'title') {
      const nextTitle = tokens.join(' ').trim()
      title = nextTitle.length ? nextTitle : 'Untitled'
      continue
    }

    if (lowerKey === 'size') {
      const sizeToken = tokens[0] ?? ''
      const match = sizeToken.match(SIZE_RE)
      if (!match) throw new Error(`Invalid size token: ${sizeToken}`)

      width = Number(match[1])
      height = Number(match[2])
      continue
    }

    if (lowerKey === 'background') continue

    const isText = key !== lowerKey
    let name = lowerKey
    let dir: LevelItem['dir']
    const directionMatch = lowerKey.match(DIRECTION_SUFFIX_RE)
    if (directionMatch) {
      const baseName = directionMatch[1]
      const parsedDir = directionMatch[2]
      if (baseName && parsedDir) {
        name = baseName
        dir = parsedDir as LevelItem['dir']
      }
    }

    for (const token of tokens) {
      const [xRaw, yRaw] = token.split(',')
      if (!xRaw || !yRaw) continue

      const x = Number(xRaw)
      const y = Number(yRaw)
      if (Number.isNaN(x) || Number.isNaN(y)) continue

      items.push({
        id: nextId++,
        name,
        x,
        y,
        isText,
        ...(dir ? { dir } : {}),
      })
    }
  }

  if (!width || !height) throw new Error('Level size is missing')

  return { title, width, height, items }
}

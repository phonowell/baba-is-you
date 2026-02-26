import { CELL_WIDTH, GRAPHEME_SEGMENTER } from './render-config.js'

export const stripAnsi = (value: string): string =>
  value.replace(/\x1b\[[0-9;]*m/g, '')

const toGraphemes = (value: string): string[] =>
  Array.from(GRAPHEME_SEGMENTER.segment(value), ({ segment }) => segment)

const isFullWidthCodePoint = (codePoint: number): boolean => {
  if (codePoint < 0x1100) return false

  return (
    codePoint <= 0x115f ||
    codePoint === 0x2329 ||
    codePoint === 0x232a ||
    (codePoint >= 0x2e80 && codePoint <= 0x3247 && codePoint !== 0x303f) ||
    (codePoint >= 0x3250 && codePoint <= 0x4dbf) ||
    (codePoint >= 0x4e00 && codePoint <= 0xa4c6) ||
    (codePoint >= 0xa960 && codePoint <= 0xa97c) ||
    (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
    (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
    (codePoint >= 0xfe10 && codePoint <= 0xfe19) ||
    (codePoint >= 0xfe30 && codePoint <= 0xfe6b) ||
    (codePoint >= 0xff01 && codePoint <= 0xff60) ||
    (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
    (codePoint >= 0x1b000 && codePoint <= 0x1b001) ||
    (codePoint >= 0x1f200 && codePoint <= 0x1f251) ||
    (codePoint >= 0x20000 && codePoint <= 0x3fffd)
  )
}

const graphemeWidth = (value: string): number => {
  if (/\p{Extended_Pictographic}/u.test(value)) return 2

  let width = 0
  for (const char of value) {
    const codePoint = char.codePointAt(0)
    if (!codePoint) continue

    if (
      codePoint === 0x200d ||
      (codePoint >= 0xfe00 && codePoint <= 0xfe0f) ||
      /\p{Mark}/u.test(char)
    )
      continue

    width += isFullWidthCodePoint(codePoint) ? 2 : 1
  }

  return width
}

const displayWidth = (value: string): number =>
  toGraphemes(value).reduce(
    (total, grapheme) => total + graphemeWidth(grapheme),
    0,
  )

const truncateToWidth = (value: string, maxWidth: number): string => {
  let width = 0
  let result = ''

  for (const grapheme of toGraphemes(value)) {
    const nextWidth = graphemeWidth(grapheme)
    if (width + nextWidth > maxWidth) break

    result += grapheme
    width += nextWidth
  }

  return result
}

export const formatCell = (value: string): string => {
  const width = displayWidth(value)
  if (width === CELL_WIDTH) return value

  if (width > CELL_WIDTH) {
    const truncated = truncateToWidth(value, CELL_WIDTH)
    return truncated.padEnd(CELL_WIDTH, ' ')
  }

  return value.padEnd(value.length + (CELL_WIDTH - width), ' ')
}

export const measureDisplayWidth = (value: string): number =>
  displayWidth(value)

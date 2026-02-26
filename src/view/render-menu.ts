type MenuLevel = {
  title: string
}

const ANSI_RESET = '\x1b[0m'
const ANSI_TITLE = '\x1b[35m'
const ANSI_INFO = '\x1b[36m'
const ANSI_SELECTED = '\x1b[33m'

export const MENU_WINDOW_SIZE = 10

export type MenuViewState = {
  levels: MenuLevel[]
  selectedLevelIndex: number
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

const pickWindow = (
  total: number,
  selected: number,
  windowSize: number,
): [start: number, end: number] => {
  if (total <= windowSize) return [0, total]

  const half = Math.floor(windowSize / 2)
  const start = clamp(selected - half, 0, total - windowSize)
  return [start, start + windowSize]
}

export const renderMenu = (state: MenuViewState): string => {
  const total = state.levels.length
  const selected = clamp(state.selectedLevelIndex, 0, Math.max(0, total - 1))
  const selectedTitle = state.levels[selected]?.title ?? '(unknown)'
  const [start, end] = pickWindow(total, selected, MENU_WINDOW_SIZE)

  const listLines: string[] = []
  if (start > 0) listLines.push('  ...')
  for (let i = start; i < end; i += 1) {
    const level = state.levels[i]
    if (!level) continue

    const marker = i === selected ? '>' : ' '
    const number = String(i + 1).padStart(3, ' ')
    const line = `${marker} ${number}. ${level.title}`
    listLines.push(
      i === selected ? `${ANSI_SELECTED}${line}${ANSI_RESET}` : line,
    )
  }
  if (end < total) listLines.push('  ...')

  return [
    `${ANSI_TITLE}BABA IS YOU${ANSI_RESET}`,
    '',
    `${ANSI_INFO}Levels:${ANSI_RESET} ${total}`,
    `${ANSI_INFO}Selected:${ANSI_RESET} ${selected + 1}. ${selectedTitle}`,
    `${ANSI_INFO}Controls:${ANSI_RESET} W/S or Up/Down select, A/D or Left/Right page, Enter/N start, Q quit`,
    `${ANSI_INFO}In game:${ANSI_RESET} Q returns to this menu`,
    '',
    `${ANSI_INFO}Select Level${ANSI_RESET}`,
    ...listLines,
  ].join('\n')
}

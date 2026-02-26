import { promises as fs } from 'node:fs'
import path from 'node:path'

const parseLevelSortKey = (
  basename: string,
): [group: number, a: number, b: number, tail: string] => {
  const numeric = basename.match(/^(\d+)-(.+)$/)
  if (numeric) {
    const numberPart = numeric[1]
    const tailPart = numeric[2]
    if (numberPart && tailPart) return [0, Number(numberPart), 0, tailPart]
  }

  const letter = basename.match(/^([a-z])-(.+)$/)
  if (letter) {
    const charPart = letter[1]
    const tailPart = letter[2]
    if (charPart && tailPart) return [1, charPart.charCodeAt(0), 0, tailPart]
  }

  const extra = basename.match(/^extra-(\d+)-(.+)$/)
  if (extra) {
    const numberPart = extra[1]
    const tailPart = extra[2]
    if (numberPart && tailPart) return [2, Number(numberPart), 0, tailPart]
  }

  return [3, 0, 0, basename]
}

const compareSortKey = (a: string, b: string): number => {
  const ak = parseLevelSortKey(a)
  const bk = parseLevelSortKey(b)
  if (ak[0] !== bk[0]) return ak[0] - bk[0]
  if (ak[1] !== bk[1]) return ak[1] - bk[1]
  if (ak[2] !== bk[2]) return ak[2] - bk[2]
  return ak[3].localeCompare(bk[3])
}

const parseTopLevelSortKey = (
  basename: string,
): [group: number, n: number, tail: string] => {
  const m = basename.match(/^(\d+)-(.+)$/)
  if (!m) return [1, 0, basename]

  const numberPart = m[1]
  const tailPart = m[2]
  if (!numberPart || !tailPart) return [1, 0, basename]

  return [0, Number(numberPart), tailPart]
}

const compareTopLevel = (a: string, b: string): number => {
  const ak = parseTopLevelSortKey(a)
  const bk = parseTopLevelSortKey(b)
  if (ak[0] !== bk[0]) return ak[0] - bk[0]
  if (ak[1] !== bk[1]) return ak[1] - bk[1]
  return ak[2].localeCompare(bk[2])
}

export const buildImportOrder = async (
  levelsRoot: string,
): Promise<string[]> => {
  const entries = await fs.readdir(levelsRoot, { withFileTypes: true })
  const topFiles = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => name.endsWith('.txt'))
    .sort(compareTopLevel)
  const dirs = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort(compareTopLevel)

  const ordered: string[] = topFiles
  for (const dir of dirs) {
    const dirPath = path.join(levelsRoot, dir)
    const files = (await fs.readdir(dirPath, { withFileTypes: true }))
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .filter((name) => name.endsWith('.txt'))
      .sort(compareSortKey)
    for (const name of files) ordered.push(path.join(dir, name))
  }

  return ordered
}

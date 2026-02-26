import { PROPERTY_WORDS } from './types.js'

import type { LevelItem, Rule } from './types.js'

type ParsedTerm = {
  negated: boolean
  word: string
}

type ParseChainResult = {
  chains: ParsedTerm[][]
  cutByBoundary: boolean
}

const OPERATOR_WORDS = new Set<string>(['is', 'and', 'has', 'not', 'on', 'make'])
const CHAIN_BOUNDARY_WORDS = new Set<string>(['is', 'has'])

const isNounWord = (word: string): boolean => {
  if (PROPERTY_WORDS.has(word)) return false
  return !OPERATOR_WORDS.has(word)
}

const keyFor = (x: number, y: number, width: number): number => y * width + x

const inBounds = (x: number, y: number, width: number, height: number): boolean =>
  x >= 0 && y >= 0 && x < width && y < height

const getWordsAt = (
  grid: Map<number, string[]>,
  width: number,
  x: number,
  y: number,
): string[] => grid.get(keyFor(x, y, width)) ?? []

const parseTermOptions = (
  readWordsAt: (position: number) => string[],
  position: number,
  isValidWord: (word: string) => boolean,
  allowTrailingNot: boolean,
): Array<ParsedTerm & { next: number }> => {
  const result = new Map<string, ParsedTerm & { next: number }>()

  const addOption = (word: string, negated: boolean, next: number): void => {
    if (!isValidWord(word)) return
    result.set(`${word}:${negated ? '1' : '0'}:${next}`, { word, negated, next })
  }

  const currentWords = readWordsAt(position)
  const hasTrailingNot = allowTrailingNot && readWordsAt(position + 1).includes('not')
  if (!hasTrailingNot)
    for (const word of currentWords) addOption(word, false, position + 1)

  let leadingOffset = 0
  while (readWordsAt(position + leadingOffset).includes('not')) {
    leadingOffset += 1
    const negated = leadingOffset % 2 === 1
    for (const word of readWordsAt(position + leadingOffset))
      addOption(word, negated, position + leadingOffset + 1)
  }

  if (allowTrailingNot) {
    let trailingOffset = 1
    while (readWordsAt(position + trailingOffset).includes('not')) {
      const negated = trailingOffset % 2 === 1
      for (const word of currentWords)
        addOption(word, negated, position + trailingOffset + 1)
      trailingOffset += 1
    }
  }

  return Array.from(result.values())
}

const parseTermChains = (
  readWordsAt: (position: number) => string[],
  position: number,
  isValidWord: (word: string) => boolean,
  depth: number,
  maxDepth: number,
  allowTrailingNot: boolean,
  stopAtOperatorBoundary: boolean,
): ParseChainResult => {
  if (depth > maxDepth) return { chains: [], cutByBoundary: false }

  const termOptions = parseTermOptions(
    readWordsAt,
    position,
    isValidWord,
    allowTrailingNot,
  )
  if (!termOptions.length) return { chains: [], cutByBoundary: false }

  const chains: ParsedTerm[][] = []
  let cutByBoundary = false
  for (const option of termOptions) {
    const nextWords = readWordsAt(option.next)
    if (
      stopAtOperatorBoundary &&
      depth > 0 &&
      nextWords.some((word) => CHAIN_BOUNDARY_WORDS.has(word))
    ) {
      cutByBoundary = true
      continue
    }

    if (!nextWords.includes('and')) {
      chains.push([{ word: option.word, negated: option.negated }])
      continue
    }

    const rest = parseTermChains(
      readWordsAt,
      option.next + 1,
      isValidWord,
      depth + 1,
      maxDepth,
      allowTrailingNot,
      stopAtOperatorBoundary,
    )

    if (rest.chains.length)
      for (const chain of rest.chains)
        chains.push([{ word: option.word, negated: option.negated }, ...chain])
    else if (rest.cutByBoundary)
      chains.push([{ word: option.word, negated: option.negated }])

    if (rest.cutByBoundary) cutByBoundary = true
  }

  return { chains, cutByBoundary }
}

const uniqueTerms = (chains: ParsedTerm[][]): ParsedTerm[] => {
  const result = new Map<string, ParsedTerm>()
  for (const chain of chains)
    for (const term of chain)
      result.set(`${term.word}:${term.negated ? '1' : '0'}`, term)

  return Array.from(result.values())
}

const isSubjectWord = (word: string): boolean =>
  isNounWord(word) || word === 'text' || word === 'empty'

const isPredicateWordForIs = (word: string): boolean =>
  PROPERTY_WORDS.has(word) || isNounWord(word) || word === 'text' || word === 'empty'

const isPredicateWordForHas = (word: string): boolean =>
  isNounWord(word) || word === 'text' || word === 'empty'

export const collectRules = (
  items: LevelItem[],
  width: number,
  height: number,
): Rule[] => {
  const grid = new Map<number, string[]>()
  for (const item of items) {
    if (!item.isText) continue
    if (item.x < 0 || item.x >= width || item.y < 0 || item.y >= height) continue

    const key = keyFor(item.x, item.y, width)
    const list = grid.get(key) ?? []
    list.push(item.name)
    grid.set(key, list)
  }

  const maxDepth = width + height
  const rules: Rule[] = []
  const seen = new Set<string>()

  for (const item of items) {
    if (!item.isText || (item.name !== 'is' && item.name !== 'has')) continue

    const dirs: Array<[number, number]> = [
      [1, 0],
      [0, 1],
    ]

    for (const [dx, dy] of dirs) {
      const readSubjectWordsAt = (position: number): string[] => {
        const x = item.x - dx * position
        const y = item.y - dy * position
        if (!inBounds(x, y, width, height)) return []
        return getWordsAt(grid, width, x, y)
      }
      const readObjectWordsAt = (position: number): string[] => {
        const x = item.x + dx * position
        const y = item.y + dy * position
        if (!inBounds(x, y, width, height)) return []
        return getWordsAt(grid, width, x, y)
      }

      const subjectChains = parseTermChains(
        readSubjectWordsAt,
        1,
        isSubjectWord,
        0,
        maxDepth,
        true,
        true,
      )
      const subjectTerms = uniqueTerms(subjectChains.chains)
      if (!subjectTerms.length) continue

      const objectChains = parseTermChains(
        readObjectWordsAt,
        1,
        item.name === 'is' ? isPredicateWordForIs : isPredicateWordForHas,
        0,
        maxDepth,
        false,
        false,
      )
      const objectTerms = uniqueTerms(objectChains.chains)
      if (!objectTerms.length) continue

      for (const subject of subjectTerms)
        for (const object of objectTerms) {
          const rule: Rule = {
            subject: subject.word,
            ...(subject.negated ? { subjectNegated: true } : {}),
            object: object.word,
            ...(object.negated ? { objectNegated: true } : {}),
            kind:
              item.name === 'has'
                ? 'has'
                : PROPERTY_WORDS.has(object.word)
                  ? 'property'
                  : 'transform',
          }
          const key = `${rule.subjectNegated ? '!' : ''}${rule.subject}:${
            rule.kind
          }:${rule.objectNegated ? '!' : ''}${rule.object}`
          if (seen.has(key)) continue
          seen.add(key)
          rules.push(rule)
        }
    }
  }

  return rules
}

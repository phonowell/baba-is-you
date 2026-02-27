export type ParsedTerm = {
  negated: boolean
  word: string
}

export type ParsedTermChain = {
  terms: ParsedTerm[]
  next: number
}

type ParseChainResult = {
  chains: ParsedTerm[][]
  cutByBoundary: boolean
}

type ParseChainWithNextResult = {
  chains: ParsedTermChain[]
  cutByBoundary: boolean
}

const CHAIN_BOUNDARY_WORDS = new Set<string>([
  'is',
  'has',
  'make',
  'eat',
  'write',
])

const parseTermOptions = (
  readWordsAt: (position: number) => string[],
  position: number,
  isValidWord: (word: string) => boolean,
  allowTrailingNot: boolean,
): Array<ParsedTerm & { next: number }> => {
  const result = new Map<string, ParsedTerm & { next: number }>()

  const addOption = (word: string, negated: boolean, next: number): void => {
    if (!isValidWord(word)) return
    result.set(`${word}:${negated ? '1' : '0'}:${next}`, {
      word,
      negated,
      next,
    })
  }

  const currentWords = readWordsAt(position)
  const hasTrailingNot =
    allowTrailingNot && readWordsAt(position + 1).includes('not')
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

export const parseTermChainsWithNext = (
  readWordsAt: (position: number) => string[],
  position: number,
  isValidWord: (word: string) => boolean,
  depth: number,
  maxDepth: number,
  allowTrailingNot: boolean,
  stopAtOperatorBoundary: boolean,
): ParseChainWithNextResult => {
  if (depth > maxDepth) return { chains: [], cutByBoundary: false }

  const termOptions = parseTermOptions(
    readWordsAt,
    position,
    isValidWord,
    allowTrailingNot,
  )
  if (!termOptions.length) return { chains: [], cutByBoundary: false }

  const chains: ParsedTermChain[] = []
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
      chains.push({
        terms: [{ word: option.word, negated: option.negated }],
        next: option.next,
      })
      continue
    }

    const rest = parseTermChainsWithNext(
      readWordsAt,
      option.next + 1,
      isValidWord,
      depth + 1,
      maxDepth,
      allowTrailingNot,
      stopAtOperatorBoundary,
    )

    if (rest.chains.length) {
      for (const chain of rest.chains) {
        chains.push({
          terms: [
            { word: option.word, negated: option.negated },
            ...chain.terms,
          ],
          next: chain.next,
        })
      }
    } else {
      chains.push({
        terms: [{ word: option.word, negated: option.negated }],
        next: option.next,
      })
    }

    if (rest.cutByBoundary) cutByBoundary = true
  }

  return { chains, cutByBoundary }
}

export const parseTermChains = (
  readWordsAt: (position: number) => string[],
  position: number,
  isValidWord: (word: string) => boolean,
  depth: number,
  maxDepth: number,
  allowTrailingNot: boolean,
  stopAtOperatorBoundary: boolean,
): ParseChainResult => {
  const parsed = parseTermChainsWithNext(
    readWordsAt,
    position,
    isValidWord,
    depth,
    maxDepth,
    allowTrailingNot,
    stopAtOperatorBoundary,
  )

  return {
    chains: parsed.chains.map((chain) => chain.terms),
    cutByBoundary: parsed.cutByBoundary,
  }
}

export const uniqueTerms = (chains: ParsedTerm[][]): ParsedTerm[] => {
  const result = new Map<string, ParsedTerm>()
  for (const chain of chains) {
    for (const term of chain)
      result.set(`${term.word}:${term.negated ? '1' : '0'}`, term)
  }

  return Array.from(result.values())
}

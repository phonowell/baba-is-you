export type ParsedTerm = {
  negated: boolean
  word: string
  // Ids of the units the term was scanned from — the official sentence's
  // `wid`. A `word`-prop object contributes itself here, which is how the
  // unstable-word-rule guard tells it apart from a real `text_x` card.
  sourceIds: readonly number[]
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

// A word available at a scan position plus how many cells it occupies along
// the scan direction. Ordinary text has span 1; letter-spelled words cover
// their whole run so the parser resumes after the word's far end.
export type ScannedTerm = {
  word: string
  span: number
  // Unit ids producing this word: one text/word-object id for ordinary
  // terms, the run's letter-unit ids for spelled words.
  sourceIds: readonly number[]
}

export type ReadTermsAt = (position: number) => readonly ScannedTerm[]

import { RULE_OPERATOR_WORDS } from './types.js'

const CHAIN_BOUNDARY_WORDS = new Set<string>(RULE_OPERATOR_WORDS)

const findTerm = (
  terms: readonly ScannedTerm[],
  word: string,
): ScannedTerm | undefined => terms.find((term) => term.word === word)

const parseTermOptions = (
  readTermsAt: ReadTermsAt,
  position: number,
  isValidWord: (word: string) => boolean,
  allowTrailingNot: boolean,
): Array<ParsedTerm & { next: number }> => {
  const result = new Map<string, ParsedTerm & { next: number }>()

  // Distinct source units make distinct official sentences — a rule whose
  // subject is spelled by a `word` object is a separate feature entry from
  // one spelled by the stacked `text_x` card.
  const addOption = (
    word: string,
    negated: boolean,
    next: number,
    sourceIds: readonly number[],
  ): void => {
    if (!isValidWord(word)) return
    result.set(`${word}:${negated ? '1' : '0'}:${next}:${sourceIds.join(',')}`, {
      word,
      negated,
      next,
      sourceIds,
    })
  }

  const currentTerms = readTermsAt(position)
  for (const term of currentTerms) {
    const hasTrailingNot =
      allowTrailingNot &&
      findTerm(readTermsAt(position + term.span), 'not') !== undefined
    if (!hasTrailingNot)
      addOption(term.word, false, position + term.span, term.sourceIds)
  }

  let leadingOffset = 0
  let leadingNots = 0
  for (;;) {
    const notTerm = findTerm(readTermsAt(position + leadingOffset), 'not')
    if (!notTerm) break
    leadingOffset += notTerm.span
    leadingNots += 1
    const negated = leadingNots % 2 === 1
    for (const term of readTermsAt(position + leadingOffset))
      addOption(
        term.word,
        negated,
        position + leadingOffset + term.span,
        term.sourceIds,
      )
  }

  if (allowTrailingNot) {
    for (const term of currentTerms) {
      let trailingOffset = term.span
      let trailingNots = 0
      for (;;) {
        const notTerm = findTerm(
          readTermsAt(position + trailingOffset),
          'not',
        )
        if (!notTerm) break
        trailingOffset += notTerm.span
        trailingNots += 1
        addOption(
          term.word,
          trailingNots % 2 === 1,
          position + trailingOffset,
          term.sourceIds,
        )
      }
    }
  }

  return Array.from(result.values())
}

export const parseTermChainsWithNext = (
  readTermsAt: ReadTermsAt,
  position: number,
  isValidWord: (word: string) => boolean,
  depth: number,
  maxDepth: number,
  allowTrailingNot: boolean,
  stopAtOperatorBoundary: boolean,
): ParseChainWithNextResult => {
  if (depth > maxDepth) return { chains: [], cutByBoundary: false }

  const termOptions = parseTermOptions(
    readTermsAt,
    position,
    isValidWord,
    allowTrailingNot,
  )
  if (!termOptions.length) return { chains: [], cutByBoundary: false }

  const chains: ParsedTermChain[] = []
  let cutByBoundary = false
  for (const option of termOptions) {
    const nextTerms = readTermsAt(option.next)
    if (
      stopAtOperatorBoundary &&
      depth > 0 &&
      nextTerms.some((term) => CHAIN_BOUNDARY_WORDS.has(term.word))
    ) {
      cutByBoundary = true
      continue
    }

    const andTerm = findTerm(nextTerms, 'and')
    if (!andTerm) {
      chains.push({
        terms: [
          {
            word: option.word,
            negated: option.negated,
            sourceIds: option.sourceIds,
          },
        ],
        next: option.next,
      })
      continue
    }

    const rest = parseTermChainsWithNext(
      readTermsAt,
      option.next + andTerm.span,
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
            {
              word: option.word,
              negated: option.negated,
              sourceIds: option.sourceIds,
            },
            ...chain.terms,
          ],
          next: chain.next,
        })
      }
    } else {
      chains.push({
        terms: [
          {
            word: option.word,
            negated: option.negated,
            sourceIds: option.sourceIds,
          },
        ],
        next: option.next,
      })
    }

    if (rest.cutByBoundary) cutByBoundary = true
  }

  return { chains, cutByBoundary }
}

export const parseTermChains = (
  readTermsAt: ReadTermsAt,
  position: number,
  isValidWord: (word: string) => boolean,
  depth: number,
  maxDepth: number,
  allowTrailingNot: boolean,
  stopAtOperatorBoundary: boolean,
): ParseChainResult => {
  const parsed = parseTermChainsWithNext(
    readTermsAt,
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

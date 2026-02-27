import { inBounds, keyFor } from './helpers.js'
import {
  parseTermChains,
  parseTermChainsWithNext,
  uniqueTerms,
} from './rules-parse-terms.js'
import { PROPERTY_WORDS } from './types.js'

export { inBounds, keyFor, parseTermChains, parseTermChainsWithNext, uniqueTerms }
export type { ParsedTerm, ParsedTermChain } from './rules-parse-terms.js'

const OPERATOR_WORDS = new Set<string>([
  'is',
  'and',
  'has',
  'eat',
  'near',
  'lonely',
  'not',
  'on',
  'make',
  'facing',
  'write',
])

const isNounWord = (word: string): boolean => !OPERATOR_WORDS.has(word)

export const getWordsAt = (
  grid: Map<number, string[]>,
  width: number,
  x: number,
  y: number,
): string[] => grid.get(keyFor(x, y, width)) ?? []

export const isSubjectWord = (word: string): boolean =>
  isNounWord(word) || word === 'text' || word === 'empty'

export const isPredicateWordForIs = (word: string): boolean =>
  PROPERTY_WORDS.has(word) ||
  isNounWord(word) ||
  word === 'text' ||
  word === 'empty'

export const isPredicateWordForHas = (word: string): boolean =>
  isNounWord(word) || word === 'text' || word === 'empty'

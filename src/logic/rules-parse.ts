import { inBounds, keyFor } from './helpers.js'
import {
  parseTermChains,
  parseTermChainsWithNext,
  uniqueTerms,
} from './rules-parse-terms.js'
import {
  isConditionObjectWord,
  isObjectWord,
  PROPERTY_WORDS,
  isSubjectWord as isCanonicalSubjectWord,
} from './types.js'

export { inBounds, keyFor, parseTermChains, parseTermChainsWithNext, uniqueTerms }
export type { ParsedTerm, ParsedTermChain } from './rules-parse-terms.js'

export const isSubjectWord = (word: string): boolean => isCanonicalSubjectWord(word)

export const isPredicateWordForIs = (word: string): boolean =>
  PROPERTY_WORDS.has(word) || isObjectWord(word)

export const isPredicateWordForHas = (word: string): boolean =>
  isConditionObjectWord(word)

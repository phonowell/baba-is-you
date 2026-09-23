import { inBounds, keyFor } from './helpers.js'
import {
  parseTermChains,
  parseTermChainsWithNext,
  uniqueTerms,
} from './rules-parse-terms.js'
import {
  isDirectionWord,
  isObjectWord,
  isPropertyWord,
  isSubjectWord as isCanonicalSubjectWord,
  PROPERTY_WORDS,
} from './types.js'

import type { InfixConditionKind } from './types.js'

export { inBounds, keyFor, parseTermChains, parseTermChainsWithNext, uniqueTerms }
export type { ParsedTerm, ParsedTermChain } from './rules-parse-terms.js'

export const isSubjectWord = (word: string): boolean => isCanonicalSubjectWord(word)

// Official `argtype` per verb (editor_objectlist.lua): `is` and `write`
// accept a noun or a property object ({0, 2}); every other verb takes
// noun objects only ({0}) — the same word class as a rule subject.
export const isPredicateWordForIs = (word: string): boolean =>
  PROPERTY_WORDS.has(word) || isObjectWord(word)

export const isPredicateWordForNoun = (word: string): boolean =>
  isCanonicalSubjectWord(word)

// Official argtype/argextra per infix condition word: `feeling` takes a
// type-2 parameter ({2} — properties and direction names); `facing` takes
// a noun or a direction name ({0} plus argextra right/up/left/down);
// every other infix condition takes nouns only.
export const isConditionParamWord = (
  kind: InfixConditionKind,
  word: string,
): boolean =>
  kind === 'feeling'
    ? isPropertyWord(word) || isDirectionWord(word)
    : kind === 'facing'
      ? isCanonicalSubjectWord(word) || isDirectionWord(word)
      : isCanonicalSubjectWord(word)

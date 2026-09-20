export type Direction = 'up' | 'right' | 'down' | 'left'

export const CORE_PROPERTIES = [
  'you',
  'win',
  'stop',
  'push',
  'move',
  'open',
  'shut',
  'defeat',
  'sink',
  'hot',
  'melt',
  'weak',
  'float',
  'tele',
  'pull',
  'shift',
  'swap',
  'up',
  'right',
  'down',
  'left',
  'red',
  'blue',
  'best',
  'fall',
  'more',
  'hide',
  'sleep',
  'group',
  'facing',
  // Official type-2 vocabulary beyond the original core set. Behavioral:
  // `word` (object acts as its noun in rule text), `safe` (survives
  // destruction), `still` (cannot be pushed/pulled/shifted/swapped),
  // `broken` (cannot self-move), `3d`/`you2` (extra you-layers),
  // `bonus`/`end`/`done` (you-touch pickups/completions),
  // `power`/`power2`/`power3` (enable `powered*` conditions),
  // `phantom` (no collision/interaction), `auto`/`chill` (unprompted
  // moves), `turn`/`deturn` (per-turn rotation), `locked*` (directional
  // move lock), `fall*` (directional gravity), `boom` (explodes on
  // contact). The rest parse as inert official vocabulary (emotions,
  // colours, meta props) so imported rule text never silently degrades
  // into nouns.
  'word',
  'safe',
  'still',
  'broken',
  '3d',
  'you2',
  'bonus',
  'end',
  'done',
  'power',
  'power2',
  'power3',
  'phantom',
  'auto',
  'chill',
  'turn',
  'deturn',
  'lockedup',
  'lockeddown',
  'lockedleft',
  'lockedright',
  'fallup',
  'fallleft',
  'fallright',
  'boom',
  'group2',
  'group3',
  'back',
  'reverse',
  'revert',
  'hold',
  'select',
  'nudgeup',
  'nudgedown',
  'nudgeleft',
  'nudgeright',
  'wonder',
  'sad',
  'happy',
  'angry',
  'party',
  'pet',
  'black',
  'brown',
  'cyan',
  'green',
  'grey',
  'lime',
  'orange',
  'pink',
  'purple',
  'rosy',
  'silver',
  'white',
  'yellow',
] as const

export type Property = (typeof CORE_PROPERTIES)[number]

export type RuleKind =
  | 'is-property'
  | 'is-transform'
  | 'has'
  | 'make'
  | 'eat'
  | 'write'
  | 'fear'
  | 'follow'
  | 'mimic'
  | 'play'
  | 'become'

export const RULE_OPERATOR_WORDS = [
  'is',
  'has',
  'make',
  'eat',
  'write',
  'fear',
  'follow',
  'mimic',
  'play',
  'become',
] as const

export const RULE_CONNECTOR_WORDS = ['and', 'not'] as const

// Infix (type 7) conditions take an object parameter: `X <cond> Y IS …`.
export const INFIX_CONDITION_WORDS = [
  'on',
  'near',
  'facing',
  'nextto',
  'facedby',
  'seeing',
  'without',
  'above',
  'below',
  'besideleft',
  'besideright',
  'feeling',
] as const

// Postfix (type 3) conditions attach to the subject directly:
// `X <cond> IS …`.
export const POSTFIX_CONDITION_WORDS = [
  'lonely',
  'powered',
  'powered2',
  'powered3',
  'idle',
  'often',
  'seldom',
] as const

export const RULE_CONDITION_WORDS = [
  ...INFIX_CONDITION_WORDS,
  ...POSTFIX_CONDITION_WORDS,
] as const

export const SPECIAL_NOUN_WORDS = [
  'text',
  'empty',
  'all',
  'group',
  'group2',
  'group3',
  'level',
] as const

export type RuleOperatorWord = (typeof RULE_OPERATOR_WORDS)[number]
export type RuleConnectorWord = (typeof RULE_CONNECTOR_WORDS)[number]
export type RuleConditionWord = (typeof RULE_CONDITION_WORDS)[number]
export type SpecialNounWord = (typeof SPECIAL_NOUN_WORDS)[number]
declare const SUBJECT_WORD_BRAND: unique symbol
declare const OBJECT_WORD_BRAND: unique symbol
declare const CONDITION_OBJECT_WORD_BRAND: unique symbol
export type SubjectWord = string & {
  readonly [SUBJECT_WORD_BRAND]: 'SubjectWord'
}
export type ObjectWord = string & {
  readonly [OBJECT_WORD_BRAND]: 'ObjectWord'
}
export type ConditionObjectWord = string & {
  readonly [CONDITION_OBJECT_WORD_BRAND]: 'ConditionObjectWord'
}
export type RuleWord = SubjectWord | ObjectWord

export type PostfixConditionKind = (typeof POSTFIX_CONDITION_WORDS)[number]
export type InfixConditionKind = (typeof INFIX_CONDITION_WORDS)[number]

// One union member per postfix kind so `kind === 'x'` narrows cleanly.
type PostfixCondition = {
  [K in PostfixConditionKind]: { kind: K; negated?: boolean }
}[PostfixConditionKind]

export type RuleCondition =
  | {
      kind: Exclude<InfixConditionKind, 'facing'>
      object: ConditionObjectWord
      negated?: boolean
      // `x on not y` (not after the condition word) negates the object:
      // the unit must be on a non-y thing — distinct from `x not on y`,
      // which negates the whole condition.
      objectNegated?: boolean
    }
  | {
      kind: 'facing'
      object: ConditionObjectWord
      negated?: boolean
      objectNegated?: boolean
    }
  | {
      kind: 'facing'
      direction: Direction
      negated?: boolean
    }
  | PostfixCondition

export type Rule = {
  subject: SubjectWord
  subjectNegated?: boolean
  object: ObjectWord
  objectNegated?: boolean
  kind: RuleKind
  condition?: RuleCondition
}

export type {
  GameState,
  GameStatus,
  Item,
  LevelData,
  LevelItem,
  LevelMeta,
  StepResult,
} from './game-types.js'

export const DIRECTIONS: Direction[] = ['up', 'right', 'down', 'left']

export const PROPERTY_WORDS = new Set<string>(CORE_PROPERTIES)
const DIRECTION_WORDS = new Set<string>(DIRECTIONS)
const SPECIAL_NOUN_WORD_SET = new Set<string>(SPECIAL_NOUN_WORDS)

export const RULE_SYNTAX_WORDS = new Set<string>([
  ...RULE_OPERATOR_WORDS,
  ...RULE_CONNECTOR_WORDS,
  ...RULE_CONDITION_WORDS,
])

export const isPropertyWord = (word: string): word is Property =>
  PROPERTY_WORDS.has(word)

export const isDirectionWord = (word: string): word is Direction =>
  DIRECTION_WORDS.has(word)

export const isSpecialNounWord = (
  word: string,
): word is SpecialNounWord => SPECIAL_NOUN_WORD_SET.has(word)

export const isSubjectWord = (word: string): word is SubjectWord =>
  isSpecialNounWord(word) || !RULE_SYNTAX_WORDS.has(word)

export const isObjectWord = (word: string): word is ObjectWord =>
  isPropertyWord(word) || isSpecialNounWord(word) || !RULE_SYNTAX_WORDS.has(word)

export const isConditionObjectWord = (
  word: string,
): word is ConditionObjectWord => isObjectWord(word)

export const asSubjectWord = (word: string): SubjectWord => {
  if (!isSubjectWord(word)) throw new Error(`Invalid rule subject: ${word}`)
  return word
}

export const asObjectWord = (word: string): ObjectWord => {
  if (!isObjectWord(word)) throw new Error(`Invalid rule object: ${word}`)
  return word
}

export const asConditionObjectWord = (word: string): ConditionObjectWord => {
  if (!isConditionObjectWord(word))
    throw new Error(`Invalid rule condition object: ${word}`)
  return word
}

export const isPropertyRule = (
  rule: Rule,
): rule is Rule & { kind: 'is-property'; object: Property } =>
  rule.kind === 'is-property' && isPropertyWord(rule.object)

export const ruleOperatorForKind = (kind: RuleKind): RuleOperatorWord => {
  if (kind === 'is-property' || kind === 'is-transform') return 'is'
  return kind
}

export const TEXT_WORDS = new Set<string>([
  ...CORE_PROPERTIES,
  ...RULE_OPERATOR_WORDS,
  ...RULE_CONNECTOR_WORDS,
  ...RULE_CONDITION_WORDS,
  ...SPECIAL_NOUN_WORDS,
])

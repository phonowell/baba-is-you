import { inBounds, keyFor } from './helpers.js'

import type { LevelItem } from './types.js'

// Official letter units are `text_` objects with type 5: a-z, 0-9, plus the
// multi-char `sharp`/`flat` tiles and the `ab`/`ba` digraphs the ??? world
// defines as level-local type-5 objects. Unlike ordinary text they never act
// as standalone words — they only become rule words when a contiguous run of
// letter cells spells a dictionary word (rules.lua `formlettermap`).
const LETTER_WORDS = new Set<string>([
  ...'abcdefghijklmnopqrstuvwxyz',
  ...'0123456789',
  'sharp',
  'flat',
  'ab',
  'ba',
])

// Words letters can spell: every name in the official object table
// (`values.lua` tileslist + editor object list), `text_` prefixes stripped.
// In the base world `findletterwords` accepts any `unitreference` name — the
// palette check only applies outside it — so the dictionary is level
// independent. Level-local names are unioned in at collect time.
const SPELLABLE_WORDS = new Set<string>([
  '3d', 'above', 'algae', 'all', 'and', 'angry', 'arm', 'arrow', 'auto',
  'baba', 'back', 'badbad', 'banana', 'bat', 'bean', 'become', 'bed', 'bee',
  'below', 'belt', 'besideleft', 'besideright', 'best', 'bird', 'black',
  'blob', 'blue', 'boat', 'boba', 'bog', 'bolt', 'bomb', 'bone', 'bonus',
  'book', 'boom', 'bottle', 'box', 'brain', 'brick', 'broken', 'brown',
  'bubble', 'bucket', 'bug', 'bunny', 'burger', 'cactus', 'cake', 'car',
  'cart', 'cash', 'cat', 'chair', 'cheese', 'chili', 'chill', 'circle',
  'cliff', 'clock', 'cloud', 'cog', 'crab', 'crystal', 'cup', 'cursor',
  'cyan', 'default', 'defeat', 'deturn', 'dog', 'done', 'donut', 'door',
  'dot', 'down', 'drink', 'drum', 'dust', 'ear', 'eat', 'egg', 'empty',
  'end', 'eye', 'facedby', 'facing', 'fall', 'fallleft', 'fallright',
  'fallup', 'fear', 'feeling', 'fence', 'fire', 'fish', 'flag', 'float',
  'flower', 'fofo', 'foliage', 'follow', 'foot', 'fort', 'fox', 'frog',
  'fruit', 'fungi', 'fungus', 'gate', 'gem', 'ghost', 'grass', 'green',
  'grey', 'group', 'group2', 'group3', 'guitar', 'hand', 'happy', 'has',
  'hedge', 'hide', 'hihat', 'hold', 'hot', 'hotdog', 'house', 'husk',
  'husks', 'ice', 'idle', 'is', 'it', 'jelly', 'jiji', 'keke', 'key',
  'knight', 'ladder', 'lamp', 'lava', 'leaf', 'left', 'level', 'lever',
  'lift', 'lily', 'lime', 'line', 'lizard', 'lock', 'lockeddown',
  'lockedleft', 'lockedright', 'lockedup', 'lonely', 'love', 'make', 'me',
  'melt', 'mimic', 'mirror', 'monitor', 'monster', 'moon', 'more', 'move',
  'near', 'nextto', 'no', 'nose', 'not', 'nudgedown', 'nudgeleft',
  'nudgeright', 'nudgeup', 'often', 'on', 'open', 'orange', 'orb', 'palm',
  'pants', 'paper', 'party', 'pawn', 'pet', 'phantom', 'piano', 'pillar',
  'pink', 'pipe', 'pixel', 'pizza', 'plane', 'planet', 'plank', 'play',
  'potato', 'power', 'power2', 'power3', 'powered', 'powered2', 'powered3',
  'pull', 'pumpkin', 'purple', 'push', 'red', 'reed', 'reverse', 'revert',
  'right', 'ring', 'road', 'robot', 'rock', 'rocket', 'rose', 'rosy',
  'rubble', 'sad', 'safe', 'sax', 'scissors', 'seed', 'seeing', 'seldom',
  'select', 'sharp', 'shell', 'shift', 'shirt', 'shovel', 'shut', 'sign',
  'silver', 'sink', 'skull', 'sleep', 'snail', 'spike', 'sprout', 'square',
  'star', 'statue', 'stick', 'still', 'stop', 'stump', 'sun', 'swap',
  'sword', 'table', 'teeth', 'tele', 'text', 'tile', 'tower', 'track',
  'train', 'tree', 'trees', 'triangle', 'trumpet', 'turn', 'turnip',
  'turtle', 'ufo', 'up', 'vase', 'vine', 'wall', 'water', 'weak', 'what',
  'white', 'win', 'wind', 'without', 'wonder', 'word', 'worm', 'write',
  'yellow', 'yes', 'you', 'you2',
])

export const isLetterName = (name: string): boolean => LETTER_WORDS.has(name)

// In levels containing `play` text, letter words double as note names: the
// game registers the note table as custom objects, so lone letters a-g
// already count as one-cell words and runs are culled to note names only
// (rules.lua `cullnotes`). Note words: a-g plus sharp/flat and the octave
// suffixes 3-6 that `text_play` declares.
const NOTE_WORDS = (() => {
  const words = new Set<string>()
  const bases = ['a', 'b', 'c', 'd', 'e', 'f', 'g']
  const suffixes = ['', 'sharp', 'flat']
  const octaves = ['', '3', '4', '5', '6']
  for (const base of bases)
    for (const suffix of suffixes)
      for (const octave of octaves) words.add(`${base}${suffix}${octave}`)
  words.add('bsharp')
  words.add('esharp')
  words.add('cflat')
  words.add('fflat')
  return words
})()

// A dictionary word spelled by a contiguous run of letter cells. `dir` indexes
// RULE_SCAN_DIRS (0 = horizontal left-to-right, 1 = vertical top-to-bottom);
// `startKey`/`endKey` are the word's first/last cell in that direction. The
// word participates in rule scans only along its own direction.
export type SpelledWord = {
  word: string
  dir: 0 | 1
  startKey: number
  endKey: number
  span: number
}

const MAX_LETTER_COMBOS = 4096

// Equivalent to the official walk: a run is a maximal contiguous line of
// letter cells (length >= 2 — a lone letter is never a word); every substring
// that is a dictionary word becomes a candidate word anchored at its start
// cell. Cells may stack multiple letters, so runs enumerate the cartesian
// product of per-cell letters, deduped by (word, start cell).
export const collectSpelledWords = (
  letterCells: Map<number, string[]>,
  width: number,
  height: number,
  extraWords?: ReadonlySet<string>,
  noteMode = false,
): SpelledWord[] => {
  if (!letterCells.size) return []

  const dictionary = noteMode ? NOTE_WORDS : SPELLABLE_WORDS
  const isSpellable = (word: string): boolean =>
    dictionary.has(word) || (extraWords?.has(word) ?? false)
  const spellablePrefixes = new Set<string>()
  for (const word of dictionary)
    for (let i = 1; i < word.length; i += 1)
      spellablePrefixes.add(word.slice(0, i))
  if (extraWords)
    for (const word of extraWords)
      for (let i = 1; i < word.length; i += 1) spellablePrefixes.add(word.slice(0, i))

  const result: SpelledWord[] = []
  const seen = new Set<string>()

  const emitWords = (
    letters: string[],
    cells: number[],
    dir: 0 | 1,
  ): void => {
    for (let i = 0; i < letters.length; i += 1) {
      let word = ''
      for (let j = i; j < letters.length; j += 1) {
        word += letters[j]
        if ((word.length >= 2 || noteMode) && isSpellable(word)) {
          const key = `${dir}:${word}:${cells[i]}`
          if (!seen.has(key)) {
            seen.add(key)
            result.push({
              word,
              dir,
              startKey: cells[i]!,
              endKey: cells[j]!,
              span: j - i + 1,
            })
          }
        }
        if (!spellablePrefixes.has(word) && !isSpellable(word)) break
      }
    }
  }

  for (const dir of [0, 1] as const) {
    const [dx, dy] = dir === 0 ? [1, 0] : [0, 1]
    for (const [startKey] of letterCells) {
      const sx = startKey % width
      const sy = (startKey - sx) / width
      // Run starts only where no letter cell sits upstream.
      if (
        inBounds(sx - dx, sy - dy, width, height) &&
        letterCells.has(keyFor(sx - dx, sy - dy, width))
      )
        continue

      const cells: number[] = []
      const letterChoices: string[][] = []
      let x = sx
      let y = sy
      while (
        inBounds(x, y, width, height) &&
        letterCells.has(keyFor(x, y, width))
      ) {
        cells.push(keyFor(x, y, width))
        letterChoices.push(letterCells.get(keyFor(x, y, width))!)
        x += dx
        y += dy
      }
      // A lone cell only starts a run in note mode, where single letters
      // are registered note names (the official `cobjects` path).
      if (
        cells.length < 2 &&
        !(
          noteMode &&
          cells.length === 1 &&
          letterChoices[0]?.some((letter) => NOTE_WORDS.has(letter))
        )
      )
        continue

      let combos = 1
      for (const choices of letterChoices) combos *= choices.length
      if (combos > MAX_LETTER_COMBOS) continue

      const letters = new Array<string>(cells.length)
      const walk = (index: number): void => {
        if (index === cells.length) {
          emitWords(letters, cells, dir)
          return
        }
        for (const letter of letterChoices[index] ?? []) {
          letters[index] = letter
          walk(index + 1)
        }
      }
      walk(0)
    }
  }

  return result
}

// Letter cells keyed for `collectSpelledWords`: text items whose name is a
// letter unit. Items are filtered by bounds like the ordinary word grid.
export const collectLetterCells = (
  items: LevelItem[],
  width: number,
  height: number,
): Map<number, string[]> => {
  const letterCells = new Map<number, string[]>()
  for (const item of items) {
    if (!item.isText || !isLetterName(item.name)) continue
    if (!inBounds(item.x, item.y, width, height)) continue
    const key = keyFor(item.x, item.y, width)
    const list = letterCells.get(key) ?? []
    list.push(item.name)
    letterCells.set(key, list)
  }
  return letterCells
}

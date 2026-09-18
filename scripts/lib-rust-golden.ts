// Shared helpers for decoding the predecessor Rust project's golden replays
// (`*.ron.br`: brotli-compressed RON tuple of (screens, inputs, palette)).

import { readFileSync } from 'node:fs'
import { brotliDecompressSync } from 'node:zlib'

import type { LevelData, LevelItem } from '../src/logic/types.js'

export type Ron =
  | string
  | number
  | Ron[]
  | { tag: string; args: Ron[]; fields: Record<string, Ron> }

const tokenize = (s: string): string[] =>
  s.match(/"(?:[^"\\]|\\.)*"|[()[\],:]|[\w$]+/g) ?? []

export const parseRon = (s: string): Ron => {
  const tokens = tokenize(s)
  let pos = 0
  const value = (): Ron => {
    const t = tokens[pos++]
    if (t === undefined) throw new Error('unexpected eof')
    if (t === '[') {
      const list: Ron[] = []
      while (tokens[pos] !== ']') {
        list.push(value())
        if (tokens[pos] === ',') pos += 1
      }
      pos += 1
      return list
    }
    if (t === '(') {
      const fields: Record<string, Ron> = {}
      const args: Ron[] = []
      while (tokens[pos] !== ')') {
        if (tokens[pos + 1] === ':') {
          const key = tokens[pos++] ?? ''
          pos += 1
          fields[key] = value()
        } else {
          args.push(value())
        }
        if (tokens[pos] === ',') pos += 1
      }
      pos += 1
      return { tag: '', args, fields }
    }
    if (t === ')') throw new Error('unexpected )')
    if (/^".*"$/.test(t)) return t.slice(1, -1)
    if (/^\d/.test(t)) return Number(t)
    if (tokens[pos] === '(') {
      pos += 1
      const args: Ron[] = []
      while (tokens[pos] !== ')') {
        args.push(value())
        if (tokens[pos] === ',') pos += 1
      }
      pos += 1
      return { tag: t, args, fields: {} }
    }
    return t
  }
  return value()
}

const snake = (s: string): string =>
  s.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase()

export type RustEntity = {
  name: string
  isText: boolean
  dir?: LevelItem['dir']
}

export const entityItem = (
  e: Ron | undefined,
  dir: Ron | undefined,
): RustEntity | undefined => {
  if (typeof e !== 'object' || Array.isArray(e)) return undefined
  const inner = e.args[0]
  const innerTag =
    typeof inner === 'object' && !Array.isArray(inner) ? inner.tag : inner
  const d = snake(String(dir))
  const dir_ = (['up', 'down', 'left', 'right'] as const).includes(d as 'up')
    ? (d as LevelItem['dir'])
    : undefined
  if (e.tag === 'Noun') {
    if (innerTag === 'Level' || innerTag === 'Cursor') return undefined
    return { name: snake(String(innerTag)), isText: false, dir: dir_ }
  }
  if (e.tag === 'Text') {
    if (typeof inner === 'object' && !Array.isArray(inner)) {
      const leaf = inner.args[0]
      const leafTag =
        typeof leaf === 'object' && !Array.isArray(leaf) ? leaf.tag : leaf
      if (inner.tag === 'Object' || inner.tag === 'Adjective')
        return { name: snake(String(leafTag)), isText: true, dir: dir_ }
    }
    return { name: snake(String(innerTag)), isText: true, dir: dir_ }
  }
  return undefined
}

export const levelFromScreen = (screen: Ron, title: string): LevelData => {
  const rows = (Array.isArray(screen) ? screen : []) as Ron[]
  const items: LevelItem[] = []
  let nextId = 1
  let width = 0
  rows.forEach((row, y) => {
    const cells = (Array.isArray(row) ? row : []) as Ron[]
    width = Math.max(width, cells.length)
    cells.forEach((cell, x) => {
      if (!Array.isArray(cell)) return
      for (const ent of cell) {
        if (typeof ent !== 'object' || Array.isArray(ent)) continue
        const parsed = entityItem(ent.fields.e, ent.fields.dir)
        if (!parsed) continue
        const { dir, ...rest } = parsed
        items.push({
          id: nextId,
          x,
          y,
          ...rest,
          ...(dir && dir !== 'right' ? { dir } : {}),
        })
        nextId += 1
      }
    })
  })
  return { title, width, height: rows.length, items }
}

export type RustGolden = {
  screens: Ron[]
  inputs: string[]
}

const RUST_INPUT_CHARS: Record<string, string> = {
  Up: 'u',
  Down: 'd',
  Left: 'l',
  Right: 'r',
  Wait: 'w',
  Undo: 'z',
}

export const loadRustGolden = (path: string): RustGolden => {
  const top = parseRon(brotliDecompressSync(readFileSync(path)).toString())
  if (typeof top !== 'object' || Array.isArray(top))
    throw new Error(`unexpected ron shape in ${path}`)
  const tuple = top.args.length ? top.args : Object.values(top.fields)
  const [screens, inputsRon] = tuple as [Ron[], Ron[]]
  const inputs = inputsRon.map((i) => {
    const tag = typeof i === 'object' && !Array.isArray(i) ? i.tag : i
    const dir = typeof i === 'object' && !Array.isArray(i) ? String(i.args[0]) : ''
    return RUST_INPUT_CHARS[tag === 'Go' ? dir : String(tag)] ?? '?'
  })
  return { screens, inputs }
}

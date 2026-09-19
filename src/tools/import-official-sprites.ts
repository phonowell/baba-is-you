#!/usr/bin/env tsx
// Extracts official object art from `Data/Sprites/{name}_0_{1..3}.png`
// into the pixel-sprite record format (`palette` + `frames`). Only the
// neutral `_0_` variant is imported — the renderer maps one sprite per
// entity name and handles direction separately (belt) or not at all.

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import zlib from 'node:zlib'

type Rgba = readonly [number, number, number, number]

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

const paeth = (a: number, b: number, c: number): number => {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  if (pa <= pb && pa <= pc) return a
  return pb <= pc ? b : c
}

const decodePng = (
  bytes: Buffer,
): { width: number; height: number; pixels: Rgba[]; hasAlpha: boolean } => {
  if (!bytes.subarray(0, 8).equals(PNG_SIGNATURE))
    throw new Error('not a png')

  let width = 0
  let height = 0
  let bitDepth = 0
  let colorType = 0
  let interlace = 0
  const idat: Buffer[] = []

  let pos = 8
  while (pos + 8 <= bytes.length) {
    const length = bytes.readUInt32BE(pos)
    const type = bytes.toString('ascii', pos + 4, pos + 8)
    const body = bytes.subarray(pos + 8, pos + 8 + length)
    if (type === 'IHDR') {
      width = body.readUInt32BE(0)
      height = body.readUInt32BE(4)
      bitDepth = body[8] ?? 0
      colorType = body[9] ?? 0
      interlace = body[12] ?? 0
    } else if (type === 'IDAT') {
      idat.push(body)
    } else if (type === 'IEND') {
      break
    }
    pos += 12 + length
  }

  if (bitDepth !== 8 || interlace !== 0 || (colorType !== 2 && colorType !== 6))
    throw new Error(
      `unsupported png format depth=${bitDepth} color=${colorType} interlace=${interlace}`,
    )

  const bpp = colorType === 6 ? 4 : 3
  const stride = width * bpp + 1
  const raw = zlib.inflateSync(Buffer.concat(idat))
  if (raw.length < stride * height) throw new Error('truncated image data')

  const pixels = new Array<Rgba>(width * height)
  const prev = new Uint8Array(width * bpp)
  const line = new Uint8Array(width * bpp)

  for (let y = 0; y < height; y += 1) {
    const rowStart = y * stride
    const filter = raw[rowStart] ?? 0
    for (let i = 0; i < width * bpp; i += 1) {
      const x = raw[rowStart + 1 + i] ?? 0
      const a = i >= bpp ? (line[i - bpp] ?? 0) : 0
      const b = prev[i] ?? 0
      const c = i >= bpp ? (prev[i - bpp] ?? 0) : 0
      let value = x
      if (filter === 1) value = x + a
      else if (filter === 2) value = x + b
      else if (filter === 3) value = x + ((a + b) >> 1)
      else if (filter === 4) value = x + paeth(a, b, c)
      else if (filter !== 0) throw new Error(`unknown filter ${filter}`)
      line[i] = value & 0xff
    }

    for (let x = 0; x < width; x += 1) {
      const offset = x * bpp
      pixels[y * width + x] =
        bpp === 4
          ? [line[offset] ?? 0, line[offset + 1] ?? 0, line[offset + 2] ?? 0, line[offset + 3] ?? 0]
          : [line[offset] ?? 0, line[offset + 1] ?? 0, line[offset + 2] ?? 0, 255]
    }

    prev.set(line)
  }

  return { width, height, pixels, hasAlpha: bpp === 4 }
}

const PALETTE_CHARS =
  'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#$%&=?@~^*+-<>:;|{}[]'

const toHex = ([r, g, b]: Rgba): string =>
  `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`

const spriteFor = async (
  spritesDir: string,
  baseName: string,
): Promise<{ palette: Record<string, string>; frames: string[][] }> => {
  const images = []
  for (let frame = 1; frame <= 3; frame += 1) {
    const file = path.join(spritesDir, `${baseName}_0_${frame}.png`)
    images.push(decodePng(await fs.readFile(file)))
  }

  const palette = new Map<string, string>()
  const colorToKey = new Map<string, string>()
  const frames: string[][] = []

  for (const image of images) {
    // A few official sprites are 26px wide (cat, dog) — the voxel grid is
    // 24 columns, so crop symmetric edge columns.
    const cropX = Math.max(0, Math.ceil((image.width - 24) / 2))
    const outWidth = Math.min(image.width, 24)
    const rows: string[] = []
    for (let y = 0; y < Math.min(image.height, 24); y += 1) {
      let row = ''
      for (let x = cropX; x < cropX + outWidth; x += 1) {
        const pixel = image.pixels[y * image.width + x] ?? [0, 0, 0, 0]
        // Alpha-bearing sprites use real alpha; flat RGB frames treat pure
        // black as transparent (the official convention).
        const transparent = image.hasAlpha
          ? pixel[3] <= 128
          : pixel[0] === 0 && pixel[1] === 0 && pixel[2] === 0
        if (transparent) {
          row += '.'
          continue
        }
        const hex = toHex(pixel)
        let key = colorToKey.get(hex)
        if (!key) {
          key = PALETTE_CHARS[palette.size]
          if (!key) throw new Error(`palette overflow (${palette.size} colors)`)
          colorToKey.set(hex, key)
          palette.set(key, hex)
        }
        row += key
      }
      rows.push(row)
    }
    frames.push(rows)
  }

  return {
    palette: Object.fromEntries(palette),
    frames,
  }
}

const renderSpriteTs = (
  entries: Array<{ name: string; sprite: { palette: Record<string, string>; frames: string[][] } }>,
): string => {
  const lines = [
    '// Generated by src/tools/import-official-sprites.ts — do not edit.',
    '// Frames come straight from `Data/Sprites/{name}_0_{1..3}.png`.',
    "import type { PixelSprite } from '../types.js'",
    '',
    'export const OFFICIAL_OBJECT_SPRITES: Record<string, PixelSprite> = {',
  ]
  for (const { name, sprite } of entries) {
    lines.push(`  ${JSON.stringify(name)}: {`)
    lines.push('    palette: {')
    for (const [key, hex] of Object.entries(sprite.palette))
      lines.push(`      ${JSON.stringify(key)}: '${hex}',`)
    lines.push('    },')
    lines.push('    frames: [')
    for (const frame of sprite.frames) {
      lines.push('      [')
      for (const row of frame) lines.push(`        ${JSON.stringify(row)},`)
      lines.push('      ],')
    }
    lines.push('    ],')
    lines.push('  },')
  }
  lines.push('}', '')
  return lines.join('\n')
}

// `dreamwall`/`selector` are `[tiles]`-renamed slots whose official art is
// another object's image (`wall`/`hand` — the editor's selector pointer).
const SPRITE_ALIASES: Record<string, string> = {
  dreamwall: 'wall',
  selector: 'hand',
}

const argValue = (flag: string): string | undefined => {
  const index = process.argv.indexOf(flag)
  return index >= 0 ? process.argv[index + 1] : undefined
}

const main = async (): Promise<void> => {
  const dataDir =
    argValue('--data-dir') ?? path.join('data', 'Baba Is You', 'Data')
  const outPath =
    argValue('--out') ??
    path.join('src', 'web', 'pixel-sprites', 'data', 'objects-official.ts')
  const spritesDir = path.join(dataDir, 'Sprites')

  const files = await fs.readdir(spritesDir)
  const bases = new Set<string>()
  for (const file of files) {
    const match = file.match(/^([a-z0-9_]+)_0_[123]\.png$/)
    if (match) bases.add(match[1] ?? '')
  }

  // Extract art for every object name the levels reference that the
  // hand-authored sprite sets do not already cover. The caller passes the
  // names on argv after `--names`, defaulting to scanning levels-data.
  let wanted: string[] = []
  const namesIndex = process.argv.indexOf('--names')
  if (namesIndex >= 0) {
    wanted = process.argv.slice(namesIndex + 1).filter((arg) => !arg.startsWith('--'))
  } else {
    const levelsDir = path.join('src', 'levels-data')
    const existing = new Set<string>()
    for (const dataFile of ['objects.ts', 'creatures.ts', 'terrain.ts', 'misc.ts']) {
      const src = await fs.readFile(
        path.join('src', 'web', 'pixel-sprites', 'data', dataFile),
        'utf8',
      )
      for (const match of src.matchAll(/^ {2}([a-z_0-9]+):/gm))
        existing.add(match[1] ?? '')
    }
    const seen = new Set<string>()
    for (const chunk of await fs.readdir(levelsDir)) {
      if (!chunk.endsWith('.ts')) continue
      const src = await fs.readFile(path.join(levelsDir, chunk), 'utf8')
      for (const line of src.split('\n')) {
        const match = line.match(/^([a-z0-9_]+)(@[a-z]+)? [\d-]+,[\d-]+/)
        const name = match?.[1]
        if (!name || seen.has(name) || existing.has(name)) continue
        seen.add(name)
        if (bases.has(name) || SPRITE_ALIASES[name]) wanted.push(name)
      }
    }
    wanted.sort()
  }

  const entries: Array<{ name: string; sprite: Awaited<ReturnType<typeof spriteFor>> }> = []
  for (const name of wanted) {
    const base = SPRITE_ALIASES[name] ?? name
    if (!bases.has(base)) {
      console.warn(`skip ${name}: no ${base}_0_*.png in ${spritesDir}`)
      continue
    }
    entries.push({ name, sprite: await spriteFor(spritesDir, base) })
  }

  await fs.mkdir(path.dirname(outPath), { recursive: true })
  await fs.writeFile(outPath, renderSpriteTs(entries), 'utf8')
  console.log(`Extracted ${entries.length} sprites → ${outPath}`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
}

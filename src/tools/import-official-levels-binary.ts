import zlib from 'node:zlib'

export type ParsedLayer = {
  width: number
  height: number
  main: Buffer
  data: Buffer | null
}

const readAscii = (
  buffer: Buffer,
  state: { offset: number },
  length: number,
): string => {
  const start = state.offset
  const end = start + length
  if (end > buffer.length) throw new Error('Unexpected EOF while reading ASCII')
  state.offset = end
  return buffer.toString('ascii', start, end)
}

const readU8 = (buffer: Buffer, state: { offset: number }): number => {
  const pos = state.offset
  if (pos + 1 > buffer.length) throw new Error('Unexpected EOF while reading u8')
  state.offset = pos + 1
  return buffer[pos] ?? 0
}

const readU16 = (buffer: Buffer, state: { offset: number }): number => {
  const pos = state.offset
  if (pos + 2 > buffer.length) throw new Error('Unexpected EOF while reading u16')
  state.offset = pos + 2
  return buffer.readUInt16LE(pos)
}

const readU32 = (buffer: Buffer, state: { offset: number }): number => {
  const pos = state.offset
  if (pos + 4 > buffer.length) throw new Error('Unexpected EOF while reading u32')
  state.offset = pos + 4
  return buffer.readUInt32LE(pos)
}

const readBytes = (
  buffer: Buffer,
  state: { offset: number },
  size: number,
): Buffer => {
  const start = state.offset
  const end = start + size
  if (end > buffer.length) throw new Error('Unexpected EOF while reading bytes')
  state.offset = end
  return buffer.subarray(start, end)
}

export const parseLevelBinary = (buffer: Buffer): ParsedLayer[] => {
  const state = { offset: 0 }
  if (readAscii(buffer, state, 8) !== 'ACHTUNG!')
    throw new Error('Invalid .l magic')

  readU16(buffer, state)

  if (readAscii(buffer, state, 4) !== 'MAP ')
    throw new Error('Invalid .l MAP block tag')
  const mapLen = readU32(buffer, state)
  readBytes(buffer, state, mapLen)

  if (readAscii(buffer, state, 4) !== 'LAYR')
    throw new Error('Invalid .l LAYR block tag')
  const layrLen = readU32(buffer, state)
  const layrEnd = state.offset + layrLen
  if (layrEnd > buffer.length) throw new Error('Invalid .l LAYR block size')

  const layerCount = readU16(buffer, state)
  const layers: ParsedLayer[] = []
  for (let i = 0; i < layerCount; i += 1) {
    const width = readU32(buffer, state)
    const height = readU32(buffer, state)
    readBytes(buffer, state, 32)
    const subBlockCount = readU8(buffer, state)

    let main: Buffer | null = null
    let data: Buffer | null = null
    for (let s = 0; s < subBlockCount; s += 1) {
      const tag = readAscii(buffer, state, 4)
      if (tag === 'MAIN') {
        const compressedLen = readU32(buffer, state)
        const compressed = readBytes(buffer, state, compressedLen)
        main = zlib.inflateSync(compressed)
        continue
      }
      if (tag === 'DATA') {
        readU8(buffer, state)
        readU32(buffer, state)
        const compressedLen = readU32(buffer, state)
        const compressed = readBytes(buffer, state, compressedLen)
        data = zlib.inflateSync(compressed)
        continue
      }
      throw new Error(`Unsupported layer sub-block: ${tag}`)
    }

    if (!main) throw new Error('Layer missing MAIN data')
    const expectedMainLen = width * height * 2
    if (main.length !== expectedMainLen)
      throw new Error(
        `MAIN size mismatch: expected=${expectedMainLen} actual=${main.length}`,
      )
    if (data && data.length !== width * height)
      throw new Error(
        `DATA size mismatch: expected=${width * height} actual=${data.length}`,
      )

    layers.push({ width, height, main, data })
  }

  state.offset = layrEnd
  return layers
}

// The .l board carries a one-cell frame around the play area; when the
// grid is bigger than 2x2 the imported board drops that frame.
export type CroppedBounds = {
  crop: boolean
  minX: number
  minY: number
  maxX: number
  maxY: number
  width: number
  height: number
}

export const croppedBounds = (
  rawWidth: number,
  rawHeight: number,
): CroppedBounds => {
  const crop = rawWidth > 2 && rawHeight > 2
  const minX = crop ? 1 : 0
  const minY = crop ? 1 : 0
  const maxX = crop ? rawWidth - 2 : rawWidth - 1
  const maxY = crop ? rawHeight - 2 : rawHeight - 1
  return {
    crop,
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  }
}

// Walks every populated tile (atlas pair ≠ 255,255) on the cropped board
// of each layer matching the first layer's dimensions — the traversal
// conversion and verification share.
export const forEachBoardTile = (
  layers: ParsedLayer[],
  visit: (
    layer: ParsedLayer,
    tileX: number,
    tileY: number,
    x: number,
    y: number,
    index: number,
  ) => void,
): void => {
  const firstLayer = layers[0]
  if (!firstLayer) return
  const { width: rawWidth, height: rawHeight } = firstLayer
  const bounds = croppedBounds(rawWidth, rawHeight)
  for (const layer of layers) {
    if (layer.width !== rawWidth || layer.height !== rawHeight) continue
    for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
      for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
        const index = y * rawWidth + x
        const tileX = layer.main[index * 2] ?? 255
        const tileY = layer.main[index * 2 + 1] ?? 255
        if (tileX === 255 && tileY === 255) continue
        visit(layer, tileX, tileY, x, y, index)
      }
    }
  }
}

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import zlib from 'node:zlib'

const parseArgs = () => {
  const [, , inputArg, outArg] = process.argv
  if (!inputArg) {
    throw new Error('Usage: node scripts/unpack-level-l.mjs <file-or-dir> [out-dir]')
  }
  return {
    inputPath: path.resolve(inputArg),
    outputDir: path.resolve(outArg ?? 'tmp/unpacked-l'),
  }
}

const hasZlibHeader = (buffer) => {
  if (buffer.length < 2) return false
  if (buffer[0] !== 0x78) return false
  const cmfFlg = (buffer[0] << 8) + buffer[1]
  return cmfFlg % 31 === 0
}

const readU32 = (buffer, offset) => {
  if (offset + 4 > buffer.length) return null
  return buffer.readUInt32LE(offset)
}

const parseChunks = (buffer) => {
  const chunks = []
  let offset = 0
  while (offset < buffer.length) {
    let type = null
    let metaSize = 0
    let compressedSize = null
    let version = null
    let unknown = null
    if (offset + 4 <= buffer.length && buffer.toString('ascii', offset, offset + 4) === 'MAIN') {
      type = 'MAIN'
      metaSize = 8
      compressedSize = readU32(buffer, offset + 4)
    } else if (
      offset + 5 <= buffer.length &&
      buffer.toString('ascii', offset, offset + 5) === 'ODATA'
    ) {
      type = 'ODATA'
      metaSize = 14
      version = readU32(buffer, offset + 5)
      unknown = buffer[offset + 9]
      compressedSize = readU32(buffer, offset + 10)
    } else if (
      offset + 4 <= buffer.length &&
      buffer.toString('ascii', offset, offset + 4) === 'DATA'
    ) {
      type = 'DATA'
      metaSize = 13
      version = readU32(buffer, offset + 4)
      unknown = buffer[offset + 8]
      compressedSize = readU32(buffer, offset + 9)
    }

    if (type === null || compressedSize === null || compressedSize <= 0) {
      offset += 1
      continue
    }

    const dataOffset = offset + metaSize
    const dataEnd = dataOffset + compressedSize
    if (dataEnd > buffer.length) {
      offset += 1
      continue
    }

    const compressed = buffer.subarray(dataOffset, dataEnd)
    if (!hasZlibHeader(compressed)) {
      offset += 1
      continue
    }

    try {
      const decompressed = zlib.inflateSync(compressed)
      chunks.push({
        type,
        offset,
        metaSize,
        compressedSize,
        decompressedSize: decompressed.length,
        version,
        unknown,
        compressed,
        decompressed,
      })
      offset = dataEnd
    } catch {
      offset += 1
    }
  }
  return chunks
}

const getInputFiles = async (inputPath) => {
  const stat = await readFile(inputPath).then(
    () => ({ isFile: () => true, isDirectory: () => false }),
    async () => {
      const entries = await readdir(inputPath, { withFileTypes: true })
      const files = entries.filter((entry) => entry.isFile() && entry.name.endsWith('.l'))
      return {
        isFile: () => false,
        isDirectory: () => true,
        files: files.map((entry) => path.join(inputPath, entry.name)).sort(),
      }
    }
  )
  if (stat.isFile()) return [inputPath]
  if (stat.isDirectory()) return stat.files
  return []
}

const writeResult = async (filePath, outRoot) => {
  const source = await readFile(filePath)
  const chunks = parseChunks(source)
  const baseName = path.basename(filePath, '.l')
  const outDir = path.join(outRoot, baseName)
  await mkdir(outDir, { recursive: true })
  const summary = []
  for (const [index, chunk] of chunks.entries()) {
    const prefix = String(index).padStart(2, '0')
    const compressedName = `${prefix}_${chunk.type}.zlib`
    const rawName = `${prefix}_${chunk.type}.raw`
    await writeFile(path.join(outDir, compressedName), chunk.compressed)
    await writeFile(path.join(outDir, rawName), chunk.decompressed)
    summary.push({
      index,
      type: chunk.type,
      offset: chunk.offset,
      metaSize: chunk.metaSize,
      compressedSize: chunk.compressedSize,
      decompressedSize: chunk.decompressedSize,
      version: chunk.version,
      unknown: chunk.unknown,
      compressedFile: compressedName,
      rawFile: rawName,
    })
  }
  await writeFile(path.join(outDir, 'chunks.json'), JSON.stringify(summary, null, 2) + '\n', 'utf8')
  return { filePath, chunkCount: chunks.length, outDir }
}

const run = async () => {
  const { inputPath, outputDir } = parseArgs()
  const files = await getInputFiles(inputPath)
  if (files.length === 0) {
    throw new Error(`No .l files found in ${inputPath}`)
  }
  await mkdir(outputDir, { recursive: true })
  const results = []
  for (const filePath of files) {
    const result = await writeResult(filePath, outputDir)
    results.push(result)
  }
  const failed = results.filter((result) => result.chunkCount === 0)
  console.log(`unpacked=${results.length} out=${outputDir}`)
  console.log(`zero_chunks=${failed.length}`)
  for (const result of results.slice(0, 10)) {
    console.log(`${path.basename(result.filePath)} chunks=${result.chunkCount} dir=${result.outDir}`)
  }
}

await run()

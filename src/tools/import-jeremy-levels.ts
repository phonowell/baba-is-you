#!/usr/bin/env tsx
import { promises as fs } from 'node:fs'
import path from 'node:path'

import { convertOneLevel } from './jeremy-import-convert.js'
import {
  groupLevels,
  renderLevelsIndex,
  renderLevelsTs,
  toChunkSlug,
} from './jeremy-import-output.js'
import { buildImportOrder } from './jeremy-level-order.js'

import type { ConvertedLevel, StopResult } from './jeremy-import-types.js'

const main = async (): Promise<void> => {
  const cwd = process.cwd()
  const levelsRoot = path.resolve(cwd, '..', 'baba', 'levels')
  const outputFile = path.resolve(cwd, 'src', 'levels.ts')
  const outputDir = path.resolve(cwd, 'src', 'levels-data')
  const ordered = await buildImportOrder(levelsRoot)

  if (!ordered.length) throw new Error(`No level files found in ${levelsRoot}`)

  const converted: ConvertedLevel[] = []
  let stop: StopResult | null = null

  for (const relFile of ordered) {
    const absFile = path.join(levelsRoot, relFile)
    const result = await convertOneLevel(absFile, relFile)
    if (result.stop) {
      stop = result.stop
      break
    }
    converted.push(result.level)
  }

  if (!converted.length) {
    const reason = stop?.reason ?? 'no level converted'
    throw new Error(`Import aborted before first level: ${reason}`)
  }

  const chunks = groupLevels(converted)
  if (!chunks.length) throw new Error('No level chunk generated')

  await fs.rm(outputDir, { recursive: true, force: true })
  await fs.mkdir(outputDir, { recursive: true })

  const chunkSpecs: Array<{ importPath: string; identifier: string }> = []
  for (let i = 0; i < chunks.length; i += 1) {
    const chunk = chunks[i]
    if (!chunk) continue

    const index = String(i).padStart(2, '0')
    const fileName = `${index}-${toChunkSlug(chunk.key)}.ts`
    const absPath = path.join(outputDir, fileName)
    await fs.writeFile(absPath, renderLevelsTs(chunk.levels), 'utf8')
    chunkSpecs.push({
      importPath: `./levels-data/${fileName.replace(/\.ts$/, '.js')}`,
      identifier: `levels_${index}`,
    })
  }

  await fs.writeFile(outputFile, renderLevelsIndex(chunkSpecs), 'utf8')

  console.log(
    `Imported ${converted.length} level(s) into src/levels.ts + ${chunkSpecs.length} chunk file(s)`,
  )
  console.log(
    `Last imported source: ${converted.at(-1)?.source ?? '(unknown)'}`,
  )
  if (stop) {
    console.log(`Stopped at: ${stop.file}`)
    console.log(`Reason: ${stop.reason}`)
  } else
    console.log('Completed all available levels without unsupported features.')
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(message)
  process.exit(1)
})

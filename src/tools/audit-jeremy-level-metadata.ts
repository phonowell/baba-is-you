#!/usr/bin/env tsx
import { promises as fs } from 'node:fs'
import path from 'node:path'

import { parseMetaEntries, summarize } from './jeremy-audit-parse.js'
import { renderMarkdown } from './jeremy-audit-render.js'
import { buildImportOrder } from './jeremy-level-order.js'

import type { FileReport } from './jeremy-audit-types.js'

const main = async (): Promise<void> => {
  const cwd = process.cwd()
  const levelsRoot = path.resolve(cwd, '..', 'baba', 'levels')
  const reportJsonFile = path.resolve(
    cwd,
    'plans',
    'jeremy-level-meta-all-values.json',
  )
  const reportMdFile = path.resolve(cwd, 'plans', 'jeremy-level-meta-values.md')

  const ordered = await buildImportOrder(levelsRoot)
  if (!ordered.length) throw new Error(`No levels found at ${levelsRoot}`)

  const reports: FileReport[] = []
  for (const relativePath of ordered) {
    const absolutePath = path.join(levelsRoot, relativePath)
    const raw = await fs.readFile(absolutePath, 'utf8')
    const report = parseMetaEntries(raw)
    report.file = relativePath
    reports.push(report)
  }

  const keySummary = summarize(reports)
  const jsonOutput = {
    files: reports,
    generatedAt: new Date().toISOString(),
    keys: keySummary,
    levelsRoot,
  }
  const markdownOutput = renderMarkdown(reports, keySummary)

  await fs.mkdir(path.dirname(reportJsonFile), { recursive: true })
  await fs.writeFile(
    reportJsonFile,
    `${JSON.stringify(jsonOutput, null, 2)}\n`,
    'utf8',
  )
  await fs.writeFile(reportMdFile, `${markdownOutput}\n`, 'utf8')

  console.log(`Wrote: ${path.relative(cwd, reportJsonFile)}`)
  console.log(`Wrote: ${path.relative(cwd, reportMdFile)}`)
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(message)
  process.exit(1)
})

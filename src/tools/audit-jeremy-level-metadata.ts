#!/usr/bin/env tsx
import { promises as fs } from 'node:fs'
import path from 'node:path'

type MetaEntry = {
  key: string | null
  line: number
  raw: string
  value: string | null
}

type FileReport = {
  delimiterCount: number
  delimiterLine: number | null
  file: string
  meta: MetaEntry[]
}

type KeySummary = {
  files: number
  key: string
  total: number
  values: Array<{
    count: number
    value: string
  }>
}

const parseLevelSortKey = (
  basename: string,
): [group: number, a: number, b: number, tail: string] => {
  const numeric = basename.match(/^(\d+)-(.+)$/)
  if (numeric) {
    const numberPart = numeric[1]
    const tailPart = numeric[2]
    if (numberPart && tailPart) return [0, Number(numberPart), 0, tailPart]
  }

  const letter = basename.match(/^([a-z])-(.+)$/)
  if (letter) {
    const charPart = letter[1]
    const tailPart = letter[2]
    if (charPart && tailPart) return [1, charPart.charCodeAt(0), 0, tailPart]
  }

  const extra = basename.match(/^extra-(\d+)-(.+)$/)
  if (extra) {
    const numberPart = extra[1]
    const tailPart = extra[2]
    if (numberPart && tailPart) return [2, Number(numberPart), 0, tailPart]
  }

  return [3, 0, 0, basename]
}

const compareSortKey = (a: string, b: string): number => {
  const ak = parseLevelSortKey(a)
  const bk = parseLevelSortKey(b)
  if (ak[0] !== bk[0]) return ak[0] - bk[0]
  if (ak[1] !== bk[1]) return ak[1] - bk[1]
  if (ak[2] !== bk[2]) return ak[2] - bk[2]
  return ak[3].localeCompare(bk[3])
}

const parseTopLevelSortKey = (
  basename: string,
): [group: number, n: number, tail: string] => {
  const m = basename.match(/^(\d+)-(.+)$/)
  if (!m) return [1, 0, basename]

  const numberPart = m[1]
  const tailPart = m[2]
  if (!numberPart || !tailPart) return [1, 0, basename]

  return [0, Number(numberPart), tailPart]
}

const compareTopLevel = (a: string, b: string): number => {
  const ak = parseTopLevelSortKey(a)
  const bk = parseTopLevelSortKey(b)
  if (ak[0] !== bk[0]) return ak[0] - bk[0]
  if (ak[1] !== bk[1]) return ak[1] - bk[1]
  return ak[2].localeCompare(bk[2])
}

const buildImportOrder = async (levelsRoot: string): Promise<string[]> => {
  const entries = await fs.readdir(levelsRoot, { withFileTypes: true })
  const topFiles = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => name.endsWith('.txt'))
    .sort(compareTopLevel)
  const dirs = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort(compareTopLevel)

  const ordered: string[] = topFiles
  for (const dir of dirs) {
    const dirPath = path.join(levelsRoot, dir)
    const files = (await fs.readdir(dirPath, { withFileTypes: true }))
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .filter((name) => name.endsWith('.txt'))
      .sort(compareSortKey)
    for (const name of files) ordered.push(path.join(dir, name))
  }

  return ordered
}

const parseMetaEntries = (raw: string): FileReport => {
  const lines = raw.replace(/\r\n/g, '\n').split('\n')
  const delimiterLine = lines.findIndex(
    (line) => line === '---' || line === '+++',
  )
  const delimiterCount = lines.reduce(
    (count, line) => (line === '---' || line === '+++' ? count + 1 : count),
    0,
  )
  const metaLines = delimiterLine < 0 ? lines : lines.slice(0, delimiterLine)
  const meta: MetaEntry[] = []

  for (let i = 0; i < metaLines.length; i += 1) {
    const line = metaLines[i]
    if (!line || !line.trim().length) continue

    const splitAt = line.indexOf(' = ')
    if (splitAt < 0) {
      meta.push({
        key: null,
        line: i + 1,
        raw: line,
        value: null,
      })
      continue
    }

    const key = line.slice(0, splitAt)
    const value = line.slice(splitAt + ' = '.length)
    meta.push({
      key,
      line: i + 1,
      raw: line,
      value,
    })
  }

  return {
    delimiterCount,
    delimiterLine: delimiterLine >= 0 ? delimiterLine + 1 : null,
    file: '',
    meta,
  }
}

const summarize = (reports: FileReport[]): KeySummary[] => {
  const byKey = new Map<
    string,
    {
      files: Set<string>
      total: number
      values: Map<string, number>
    }
  >()

  for (const report of reports) {
    const seenInFile = new Set<string>()
    for (const entry of report.meta) {
      if (!entry.key || entry.value === null) continue

      const current = byKey.get(entry.key) ?? {
        files: new Set<string>(),
        total: 0,
        values: new Map<string, number>(),
      }
      current.total += 1
      current.values.set(entry.value, (current.values.get(entry.value) ?? 0) + 1)
      if (!seenInFile.has(entry.key)) {
        current.files.add(report.file)
        seenInFile.add(entry.key)
      }
      byKey.set(entry.key, current)
    }
  }

  return Array.from(byKey.entries())
    .map(([key, value]) => ({
      files: value.files.size,
      key,
      total: value.total,
      values: Array.from(value.values.entries())
        .map(([entryValue, count]) => ({ count, value: entryValue }))
        .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value)),
    }))
    .sort((a, b) => b.total - a.total || a.key.localeCompare(b.key))
}

const renderMarkdown = (reports: FileReport[], keySummary: KeySummary[]): string => {
  const padKeys = ['left pad', 'right pad', 'top pad', 'bottom pad']
  const padLines = reports.flatMap((report) =>
    report.meta
      .filter((entry) => entry.key && padKeys.includes(entry.key))
      .map((entry) => {
        const key = entry.key
        const value = entry.value
        return `- \`${report.file}:${entry.line}\` \`${key}\` = \`${value}\``
      }),
  )
  const malformed = reports.flatMap((report) =>
    report.meta
      .filter((entry) => entry.key === null)
      .map((entry) => `- \`${report.file}:${entry.line}\` \`${entry.raw}\``),
  )
  const multiDelimiter = reports.filter((report) => report.delimiterCount > 1)

  const blocks: string[] = []
  blocks.push('# Jeremy Levels Metadata Report')
  blocks.push('')
  blocks.push(`- files scanned: ${reports.length}`)
  blocks.push(`- total metadata entries: ${reports.reduce((sum, report) => sum + report.meta.length, 0)}`)
  blocks.push(`- malformed metadata entries: ${malformed.length}`)
  blocks.push(`- files with multi-layer delimiter: ${multiDelimiter.length}`)
  blocks.push('')
  blocks.push('## Key Summary')
  for (const key of keySummary) {
    const values = key.values.map((value) => `${value.value} (${value.count})`).join(', ')
    blocks.push(`- \`${key.key}\`: total=${key.total}, files=${key.files}, values=[${values}]`)
  }
  blocks.push('')
  blocks.push('## Pad Entries')
  if (!padLines.length) blocks.push('- (none)')
  else blocks.push(...padLines)
  blocks.push('')
  blocks.push('## Multi-layer Files')
  if (!multiDelimiter.length) blocks.push('- (none)')
  else {
    for (const report of multiDelimiter)
      blocks.push(
        `- \`${report.file}\`: delimiterCount=${report.delimiterCount}, firstDelimiterLine=${report.delimiterLine ?? 'none'}`,
      )
  }
  blocks.push('')
  blocks.push('## Malformed Metadata Lines')
  if (!malformed.length) blocks.push('- (none)')
  else blocks.push(...malformed)
  blocks.push('')
  blocks.push('## Per-file Raw Metadata')
  for (const report of reports) {
    blocks.push(`### ${report.file}`)
    if (!report.meta.length) {
      blocks.push('- (no metadata)')
      blocks.push('')
      continue
    }

    blocks.push('```text')
    for (const entry of report.meta) {
      blocks.push(`${String(entry.line).padStart(3, ' ')} | ${entry.raw}`)
    }
    blocks.push('```')
    blocks.push('')
  }

  return blocks.join('\n')
}

const main = async (): Promise<void> => {
  const cwd = process.cwd()
  const levelsRoot = path.resolve(cwd, '..', 'baba', 'levels')
  const reportJsonFile = path.resolve(cwd, 'plans', 'jeremy-level-meta-all-values.json')
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
  await fs.writeFile(reportJsonFile, `${JSON.stringify(jsonOutput, null, 2)}\n`, 'utf8')
  await fs.writeFile(reportMdFile, `${markdownOutput}\n`, 'utf8')

  console.log(`Wrote: ${path.relative(cwd, reportJsonFile)}`)
  console.log(`Wrote: ${path.relative(cwd, reportMdFile)}`)
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(message)
  process.exit(1)
})

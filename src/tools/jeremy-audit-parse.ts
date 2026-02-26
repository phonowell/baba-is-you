import type { FileReport, KeySummary } from './jeremy-audit-types.js'

export const parseMetaEntries = (raw: string): FileReport => {
  const lines = raw.replace(/\r\n/g, '\n').split('\n')
  const delimiterLine = lines.findIndex(
    (line) => line === '---' || line === '+++',
  )
  const delimiterCount = lines.reduce(
    (count, line) => (line === '---' || line === '+++' ? count + 1 : count),
    0,
  )
  const metaLines = delimiterLine < 0 ? lines : lines.slice(0, delimiterLine)
  const meta: FileReport['meta'] = []

  for (let i = 0; i < metaLines.length; i += 1) {
    const line = metaLines[i]
    if (!line?.trim().length) continue

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

export const summarize = (reports: FileReport[]): KeySummary[] => {
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
      current.values.set(
        entry.value,
        (current.values.get(entry.value) ?? 0) + 1,
      )
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

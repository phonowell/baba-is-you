import type { FileReport, KeySummary } from './jeremy-audit-types.js'

export const renderMarkdown = (
  reports: FileReport[],
  keySummary: KeySummary[],
): string => {
  const padKeys = ['left pad', 'right pad', 'top pad', 'bottom pad']
  const padLines = reports.flatMap((report) =>
    report.meta
      .filter((entry) => entry.key && padKeys.includes(entry.key))
      .map((entry) => {
        const { key } = entry
        const { value } = entry
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
  blocks.push(
    `- total metadata entries: ${reports.reduce((sum, report) => sum + report.meta.length, 0)}`,
  )
  blocks.push(`- malformed metadata entries: ${malformed.length}`)
  blocks.push(`- files with multi-layer delimiter: ${multiDelimiter.length}`)
  blocks.push('')
  blocks.push('## Key Summary')
  for (const key of keySummary) {
    const values = key.values
      .map((value) => `${value.value} (${value.count})`)
      .join(', ')
    blocks.push(
      `- \`${key.key}\`: total=${key.total}, files=${key.files}, values=[${values}]`,
    )
  }
  blocks.push('')
  blocks.push('## Pad Entries')
  if (!padLines.length) blocks.push('- (none)')
  else blocks.push(...padLines)
  blocks.push('')
  blocks.push('## Multi-layer Files')
  if (!multiDelimiter.length) blocks.push('- (none)')
  else {
    for (const report of multiDelimiter) {
      blocks.push(
        `- \`${report.file}\`: delimiterCount=${report.delimiterCount}, firstDelimiterLine=${report.delimiterLine ?? 'none'}`,
      )
    }
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
    for (const entry of report.meta)
      blocks.push(`${String(entry.line).padStart(3, ' ')} | ${entry.raw}`)

    blocks.push('```')
    blocks.push('')
  }

  return blocks.join('\n')
}

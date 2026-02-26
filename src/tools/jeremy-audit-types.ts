export type MetaEntry = {
  key: string | null
  line: number
  raw: string
  value: string | null
}

export type FileReport = {
  delimiterCount: number
  delimiterLine: number | null
  file: string
  meta: MetaEntry[]
}

export type SummaryValue = {
  count: number
  value: string
}

export type KeySummary = {
  files: number
  key: string
  total: number
  values: SummaryValue[]
}

export type AuditJsonOutput = {
  files: FileReport[]
  generatedAt: string
  keys: KeySummary[]
  levelsRoot: string
}

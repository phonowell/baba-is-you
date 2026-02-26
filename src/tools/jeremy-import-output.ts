import type { ConvertedLevel } from './jeremy-import-types.js'

export const renderLevelsTs = (levels: ConvertedLevel[]): string => {
  const blocks = levels.map((level) => `  \`\n${level.body}\n\`,`).join('\n')
  return `export const levels = [\n${blocks}\n] as const\n`
}

type LevelChunk = {
  key: string
  levels: ConvertedLevel[]
}

const toChunkKey = (source: string): string => {
  const normalized = source.replace(/\\/g, '/')
  const firstSegment = normalized.split('/')[0]
  if (!firstSegment || firstSegment.endsWith('.txt')) return 'root'

  return firstSegment
}

export const toChunkSlug = (key: string): string =>
  key
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'chunk'

export const groupLevels = (levels: ConvertedLevel[]): LevelChunk[] => {
  const grouped = new Map<string, ConvertedLevel[]>()
  for (const level of levels) {
    const key = toChunkKey(level.source)
    const list = grouped.get(key) ?? []
    list.push(level)
    grouped.set(key, list)
  }

  return Array.from(grouped.entries()).map(([key, chunkLevels]) => ({
    key,
    levels: chunkLevels,
  }))
}

export const renderLevelsIndex = (
  chunkSpecs: Array<{ importPath: string; identifier: string }>,
): string => {
  const imports = chunkSpecs
    .map(
      (chunk) =>
        `import { levels as ${chunk.identifier} } from '${chunk.importPath}'`,
    )
    .join('\n')
  const spreads = chunkSpecs
    .map((chunk) => `  ...${chunk.identifier},`)
    .join('\n')

  return `${imports}\n\nexport const levels = [\n${spreads}\n] as const\n`
}

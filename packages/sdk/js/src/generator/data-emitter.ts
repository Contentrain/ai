import type { ModelDefinition } from '@contentrain/types'
import type { ContentFileRef } from './config-reader.js'
import { readJson, readText } from './utils.js'

/** Deterministic JSON: sorted keys, 2-space indent, trailing newline */
function canonicalStringify(data: unknown): string {
  return JSON.stringify(data, (_, v) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      return Object.keys(v).toSorted().reduce<Record<string, unknown>>((acc, k) => {
        acc[k] = (v as Record<string, unknown>)[k]
        return acc
      }, {})
    }
    return v
  }, 2)
}

export interface DataModule {
  fileName: string
  content: string
}

export async function emitDataModules(
  models: ModelDefinition[],
  contentFiles: ContentFileRef[],
): Promise<DataModule[]> {
  const results = await Promise.all(
    contentFiles.map(ref => emitSingleModule(ref, models)),
  )
  return results.filter((r): r is DataModule => r !== null)
}

async function emitSingleModule(
  ref: ContentFileRef,
  models: ModelDefinition[],
): Promise<DataModule | null> {
  const model = models.find(m => m.id === ref.modelId)
  if (!model) return null

  const localeSuffix = ref.locale ? `.${ref.locale}` : ''

  switch (model.kind) {
    case 'collection': {
      const raw = await readJson<Record<string, Record<string, unknown>>>(ref.filePath)
      if (!raw) return null
      const entries = Object.entries(raw)
        .toSorted(([a], [b]) => a.localeCompare(b, 'en'))
        .map(([id, fields]) => Object.assign({ id }, fields))
      return { fileName: `${model.id}${localeSuffix}.mjs`, content: `export default ${canonicalStringify(entries)}\n` }
    }

    case 'singleton': {
      const raw = await readJson<Record<string, unknown>>(ref.filePath)
      if (!raw) return null
      return { fileName: `${model.id}${localeSuffix}.mjs`, content: `export default ${canonicalStringify(raw)}\n` }
    }

    case 'dictionary': {
      const raw = await readJson<Record<string, string>>(ref.filePath)
      if (!raw) return null
      return { fileName: `${model.id}${localeSuffix}.mjs`, content: `export default ${canonicalStringify(raw)}\n` }
    }

    case 'document': {
      const rawText = await readText(ref.filePath)
      if (!rawText) return null
      const { frontmatter, body } = parseFrontmatter(rawText)
      const slug = ref.slug ?? model.id
      const data = { slug, ...frontmatter, content: body }
      return { fileName: `${model.id}--${slug}${localeSuffix}.mjs`, content: `export default ${canonicalStringify(data)}\n` }
    }

    default:
      return null
  }
}

// Minimal frontmatter parser (replicated from MCP pattern)
function parseFrontmatter(text: string): { frontmatter: Record<string, unknown>; body: string } {
  const normalized = text.replace(/\r\n/g, '\n')
  const match = normalized.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!match) return { frontmatter: {}, body: normalized }

  const fmStr = match[1]!
  const body = match[2]!.trim()
  const frontmatter: Record<string, unknown> = {}

  let currentKey: string | null = null
  let currentArray: string[] | null = null

  for (const line of fmStr.split('\n')) {
    // Array item
    if (/^\s+-\s+/.test(line) && currentKey) {
      const value = line.replace(/^\s+-\s+/, '').trim()
      if (!currentArray) currentArray = []
      currentArray.push(value)
      continue
    }

    // Flush previous array
    if (currentKey && currentArray) {
      frontmatter[currentKey] = currentArray
      currentKey = null
      currentArray = null
    }

    const kvMatch = line.match(/^([\w][\w.-]*)\s*:\s*(.*)$/)
    if (!kvMatch) continue

    const key = kvMatch[1]!
    const rawValue = kvMatch[2]!.trim()

    if (rawValue === '') {
      currentKey = key
      currentArray = []
      continue
    }

    if (rawValue.startsWith('[') && rawValue.endsWith(']')) {
      frontmatter[key] = rawValue.slice(1, -1).split(',').map(s => s.trim()).filter(Boolean)
      continue
    }

    frontmatter[key] = parseValue(rawValue)
  }

  if (currentKey && currentArray) {
    frontmatter[currentKey] = currentArray
  }

  return { frontmatter, body }
}

function parseValue(raw: string): unknown {
  if (raw === 'true') return true
  if (raw === 'false') return false
  if (raw === 'null') return null
  if (/^-?\d+$/.test(raw)) return parseInt(raw, 10)
  if (/^-?\d+\.\d+$/.test(raw)) return parseFloat(raw)
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    return raw.slice(1, -1)
  }
  return raw
}

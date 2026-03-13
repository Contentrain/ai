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

  // Stack-based parser that handles nested objects and arrays
  const lines = fmStr.split('\n')
  const stack: Array<{ obj: Record<string, unknown>; indent: number }> = [{ obj: frontmatter, indent: -1 }]

  for (const line of lines) {
    // Skip empty lines
    if (line.trim() === '') continue

    // Array item
    const arrayMatch = line.match(/^(\s*)-\s+(.*)$/)
    if (arrayMatch) {
      const arrIndent = arrayMatch[1]!.length
      const value = arrayMatch[2]!.trim()
      // Find the parent that owns this array
      while (stack.length > 1 && stack[stack.length - 1]!.indent >= arrIndent) {
        stack.pop()
      }
      const parent = stack[stack.length - 1]!.obj
      const lastKey = Object.keys(parent).pop()
      if (lastKey && Array.isArray(parent[lastKey])) {
        (parent[lastKey] as unknown[]).push(parseValue(value))
      }
      continue
    }

    // Key-value pair
    const kvMatch = line.match(/^(\s*)([\w][\w.-]*)\s*:\s*(.*)$/)
    if (!kvMatch) continue

    const kvIndent = kvMatch[1]!.length
    const key = kvMatch[2]!
    const rawValue = kvMatch[3]!.trim()

    // Pop stack to find correct parent based on indentation
    while (stack.length > 1 && stack[stack.length - 1]!.indent >= kvIndent) {
      stack.pop()
    }
    const current = stack[stack.length - 1]!.obj

    if (rawValue === '') {
      // Could be nested object or array — peek next line
      const nextLineIdx = lines.indexOf(line) + 1
      const nextLine = nextLineIdx < lines.length ? lines[nextLineIdx]! : ''
      if (nextLine.trim().startsWith('-')) {
        current[key] = []
      } else {
        const nested: Record<string, unknown> = {}
        current[key] = nested
        stack.push({ obj: nested, indent: kvIndent })
      }
      continue
    }

    if (rawValue.startsWith('[') && rawValue.endsWith(']')) {
      current[key] = rawValue.slice(1, -1).split(',').map(s => s.trim()).filter(Boolean)
      continue
    }

    current[key] = parseValue(rawValue)
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

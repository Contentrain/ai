import type { ModelDefinition } from '@contentrain/types'
import type { ContentFileRef } from './config-reader.js'
import { parseFrontmatter, stringLikeFieldKeys } from '../shared/frontmatter.js'
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
      const { frontmatter, body } = parseFrontmatter(rawText, stringLikeFieldKeys(model))
      const slug = ref.slug ?? model.id
      // Canonical document field is `body` (matches @contentrain/types
      // DocumentEntry.body and the MCP document_save schema).
      const data = { slug, ...frontmatter, body }
      return { fileName: `${model.id}--${slug}${localeSuffix}.mjs`, content: `export default ${canonicalStringify(data)}\n` }
    }

    default:
      return null
  }
}

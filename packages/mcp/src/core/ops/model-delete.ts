import type { ModelDefinition } from '@contentrain/types'
import type { FileChange, RepoReader } from '../contracts/index.js'
import type { OpPlan } from './types.js'

export interface ModelDeleteInput {
  model: ModelDefinition
}

export type ModelDeletePlan = OpPlan<string[]>

/**
 * Build the FileChange[] required to delete a model and its associated
 * content/meta files.
 *
 * The schema is at most two directory levels deep (e.g. document meta at
 * `.contentrain/meta/{id}/{slug}/{locale}.json`). The helper below walks
 * that much, which is enough for every model kind + locale strategy and
 * keeps us free of a general-purpose recursive lister for now.
 *
 * `result` is the legacy three-entry summary:
 * - `models/{id}.json`
 * - `content/{domain}/{id}/` (only if any content files existed)
 * - `meta/{id}/` (only if any meta files existed)
 */
export async function planModelDelete(reader: RepoReader, input: ModelDeleteInput): Promise<ModelDeletePlan> {
  const { model } = input
  const changes: FileChange[] = []
  const removed: string[] = []

  changes.push({ path: `.contentrain/models/${model.id}.json`, content: null })
  removed.push(`models/${model.id}.json`)

  const contentDir = model.content_path ?? `.contentrain/content/${model.domain}/${model.id}`
  const contentFiles = await enumerateTwoLevels(reader, contentDir)
  for (const path of contentFiles) {
    changes.push({ path, content: null })
  }
  if (contentFiles.length > 0) {
    removed.push(model.content_path ?? `content/${model.domain}/${model.id}/`)
  }

  const metaDir = `.contentrain/meta/${model.id}`
  const metaFiles = await enumerateTwoLevels(reader, metaDir)
  for (const path of metaFiles) {
    changes.push({ path, content: null })
  }
  if (metaFiles.length > 0) {
    removed.push(`meta/${model.id}/`)
  }

  changes.sort((a, b) => a.path.localeCompare(b.path))
  return { changes, result: removed, advisories: [] }
}

/** List files up to two directory levels deep. Filters to `.json` and `.md`. */
async function enumerateTwoLevels(reader: RepoReader, dir: string): Promise<string[]> {
  const results: string[] = []
  const entries = await reader.listDirectory(dir)
  for (const entry of entries) {
    const path = `${dir}/${entry}`
    if (entry.endsWith('.json') || entry.endsWith('.md')) {
      results.push(path)
      continue
    }
    const subEntries = await reader.listDirectory(path)
    for (const sub of subEntries) {
      if (sub.endsWith('.json') || sub.endsWith('.md')) {
        results.push(`${path}/${sub}`)
      }
    }
  }
  return results
}

import type { ModelDefinition } from '@contentrain/types'
import type { FileChange, RepoReader } from '../contracts/index.js'
import { canonicalStringify } from '../serialization/index.js'
import type { OpPlan } from './types.js'

/** Field order for canonical model JSON — preserves reader ergonomics. */
const MODEL_FIELD_ORDER = [
  'id',
  'name',
  'kind',
  'domain',
  'i18n',
  'description',
  'content_path',
  'locale_strategy',
  'fields',
]

export interface ModelSaveInput {
  model: ModelDefinition
}

export interface ModelSaveResult {
  action: 'created' | 'updated'
  id: string
}

export type ModelSavePlan = OpPlan<ModelSaveResult>

/**
 * Build the FileChange[] required to create or update a model definition.
 *
 * The only disk change is the model JSON file itself. Content and meta
 * directories are created on-demand when their first write lands — git does
 * not track empty directories, and MCP's write helpers `mkdir -p` before
 * every file write, so there is no operational reason to emit an empty-dir
 * ensure step here.
 */
export async function planModelSave(reader: RepoReader, input: ModelSaveInput): Promise<ModelSavePlan> {
  const { model } = input
  const modelPath = `.contentrain/models/${model.id}.json`

  let action: 'created' | 'updated' = 'created'
  try {
    await reader.readFile(modelPath)
    action = 'updated'
  } catch { /* not yet exists */ }

  const changes: FileChange[] = [
    { path: modelPath, content: canonicalStringify(model, MODEL_FIELD_ORDER) },
  ]

  return {
    changes,
    result: { action, id: model.id },
    advisories: [],
  }
}

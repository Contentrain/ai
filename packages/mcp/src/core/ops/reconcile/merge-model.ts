import type { ConflictItem } from '@contentrain/types'
import type { FileCtx, MergeStats, Side, ThreeWay } from './types.js'
import { EMPTY_STATS } from './types.js'
import { makeConflict, mergeLeaf3, statsFor } from './three-way.js'
import { resolvedValue } from './resolutions.js'

type RawModel = Record<string, unknown>

/**
 * Schema keys that decide where a model's files live and how they are
 * keyed. When one of THESE is itself in conflict, the content of the model
 * cannot be located or merged safely — the orchestrator blocks the model's
 * content phase and surfaces only the model-level conflict.
 */
export const STRUCTURAL_MODEL_KEYS = ['kind', 'i18n', 'locale_strategy', 'content_path'] as const

export interface ModelMergeResult {
  /** Merged definition; `undefined` = the model is deleted in the output. */
  merged: RawModel | undefined
  conflicts: ConflictItem[]
  stats: MergeStats
  /**
   * Set when one side deleted the model file and the other edited it. No
   * conflict is emitted here — the orchestrator first checks whether the
   * surviving side also touched the model's CONTENT, and collapses
   * everything into one model-level question if so.
   */
  deleteEdit?: { deletedBy: Side }
  /** True when a structural key is in conflict — content merge must not run. */
  structurallyBlocked: boolean
}

/**
 * Model definition three-way: top-level keys are leaves, except `fields`,
 * which recurses one level so two sides adding different fields both win.
 * A key changed differently on both sides is a conflict with
 * `suggested: 'theirs'` — the policy table's "the schema belongs to the
 * developer" carried as a suggestion, never auto-applied.
 */
export function mergeModelFile(
  three: ThreeWay<RawModel>,
  ctx: FileCtx,
): ModelMergeResult {
  const fileLeaf = mergeLeaf3(three.base, three.ours, three.theirs)
  if (fileLeaf.ok) {
    return {
      merged: fileLeaf.value as RawModel | undefined,
      conflicts: [],
      stats: statsFor(fileLeaf.from),
      structurallyBlocked: false,
    }
  }
  if (fileLeaf.reason === 'delete_edit') {
    return {
      merged: three.ours,
      conflicts: [],
      stats: EMPTY_STATS,
      deleteEdit: { deletedBy: fileLeaf.deletedBy! },
      structurallyBlocked: false,
    }
  }

  const conflicts: ConflictItem[] = []
  const merged: RawModel = {}

  const keys = [...new Set([
    ...Object.keys(three.base ?? {}),
    ...Object.keys(three.ours ?? {}),
    ...Object.keys(three.theirs ?? {}),
  ])].toSorted()

  for (const key of keys) {
    if (key === 'fields') continue
    const candidate = {
      path: ctx.outPath,
      key,
      base: three.base?.[key],
      ours: three.ours?.[key],
      theirs: three.theirs?.[key],
    }
    const leaf = mergeLeaf3(candidate.base, candidate.ours, candidate.theirs)
    if (leaf.ok) {
      if (leaf.value !== undefined) merged[key] = leaf.value
      continue
    }
    const resolution = ctx.resolutions.consume(candidate)
    if (resolution) {
      const value = resolvedValue(resolution, candidate)
      if (value !== undefined) merged[key] = value
      continue
    }
    if (candidate.ours !== undefined) merged[key] = candidate.ours
    conflicts.push(makeConflict({
      ...candidate,
      kind: 'model',
      model: ctx.model,
      code: 'model_key_conflict',
      message: `Model "${ctx.model}": schema key "${key}" was changed differently on both sides.`,
      suggested: 'theirs',
    }))
  }

  // `fields`: one level deeper — each field definition is a leaf.
  const fieldNames = [...new Set([
    ...Object.keys((three.base?.['fields'] as RawModel | undefined) ?? {}),
    ...Object.keys((three.ours?.['fields'] as RawModel | undefined) ?? {}),
    ...Object.keys((three.theirs?.['fields'] as RawModel | undefined) ?? {}),
  ])].toSorted()
  if (fieldNames.length > 0) {
    const mergedFields: RawModel = {}
    for (const name of fieldNames) {
      const candidate = {
        path: ctx.outPath,
        key: `fields.${name}`,
        base: (three.base?.['fields'] as RawModel | undefined)?.[name],
        ours: (three.ours?.['fields'] as RawModel | undefined)?.[name],
        theirs: (three.theirs?.['fields'] as RawModel | undefined)?.[name],
      }
      const leaf = mergeLeaf3(candidate.base, candidate.ours, candidate.theirs)
      if (leaf.ok) {
        if (leaf.value !== undefined) mergedFields[name] = leaf.value
        continue
      }
      const resolution = ctx.resolutions.consume(candidate)
      if (resolution) {
        const value = resolvedValue(resolution, candidate)
        if (value !== undefined) mergedFields[name] = value
        continue
      }
      if (candidate.ours !== undefined) mergedFields[name] = candidate.ours
      conflicts.push(makeConflict({
        ...candidate,
        kind: 'model',
        model: ctx.model,
        code: leaf.reason === 'delete_edit' ? 'delete_edit_conflict' : 'model_key_conflict',
        message: `Model "${ctx.model}": field "${name}" was changed differently on both sides.`,
        suggested: 'theirs',
      }))
    }
    if (Object.keys(mergedFields).length > 0) merged['fields'] = mergedFields
  }

  const structurallyBlocked = conflicts.some(c =>
    (STRUCTURAL_MODEL_KEYS as readonly string[]).includes(c.key ?? ''),
  )

  return {
    merged,
    conflicts,
    stats: conflicts.length === 0 ? { takenOurs: 0, takenTheirs: 0, fieldMerged: 1 } : EMPTY_STATS,
    structurallyBlocked,
  }
}

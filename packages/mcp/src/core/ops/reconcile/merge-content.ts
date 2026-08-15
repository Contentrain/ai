import type { ConflictItem } from '@contentrain/types'
import type { FileCtx, MergeStats, ThreeWay } from './types.js'
import { EMPTY_STATS, addStats } from './types.js'
import { makeConflict, mergeKeyedRecord3, mergeLeaf3, statsFor } from './three-way.js'
import { resolvedValue } from './resolutions.js'

type Fields = Record<string, unknown>

/**
 * Three-way merge of one entry's fields. Called when the entry as a whole
 * changed on BOTH sides: different fields both win (the union), the same
 * field with two values is a conflict, and a field deleted on one side but
 * edited on the other asks a different question and gets its own code.
 * An unresolved conflict keeps ours' value in the output — the plan is not
 * applied while conflicts remain, so nothing is ever silently overwritten.
 */
export function mergeEntryFields(
  three: ThreeWay<Fields>,
  ctx: FileCtx,
  entryKey?: string,
): { merged: Fields, conflicts: ConflictItem[] } {
  const fields = [...new Set([
    ...Object.keys(three.base ?? {}),
    ...Object.keys(three.ours ?? {}),
    ...Object.keys(three.theirs ?? {}),
  ])].toSorted()

  const merged: Fields = {}
  const conflicts: ConflictItem[] = []
  for (const field of fields) {
    const candidate = {
      path: ctx.outPath,
      key: entryKey,
      field,
      locale: ctx.locale,
      base: three.base?.[field],
      ours: three.ours?.[field],
      theirs: three.theirs?.[field],
    }
    const leaf = mergeLeaf3(candidate.base, candidate.ours, candidate.theirs)
    if (leaf.ok) {
      if (leaf.value !== undefined) merged[field] = leaf.value
      continue
    }

    const resolution = ctx.resolutions.consume(candidate)
    if (resolution) {
      const value = resolvedValue(resolution, candidate)
      if (value !== undefined) merged[field] = value
      continue
    }

    if (candidate.ours !== undefined) merged[field] = candidate.ours
    const label = entryKey ? `"${entryKey}" field "${field}"` : `field "${field}"`
    conflicts.push(makeConflict({
      ...candidate,
      kind: ctx.kind,
      model: ctx.model,
      code: leaf.reason === 'delete_edit' ? 'delete_edit_conflict' : 'field_value_conflict',
      message: leaf.reason === 'delete_edit'
        ? `${label} was deleted on one side and edited on the other in ${ctx.outPath}.`
        : `${label} was changed to different values on both sides in ${ctx.outPath}.`,
    }))
  }
  return { merged, conflicts }
}

/**
 * Collection file: entry-level three-way over the object-map, field-level
 * union when both sides touched the same entry.
 */
export function mergeCollectionFile(
  three: ThreeWay<Record<string, Fields>>,
  ctx: FileCtx,
): { merged: Record<string, Fields> | undefined, conflicts: ConflictItem[], stats: MergeStats } {
  const fileLeaf = mergeLeaf3(three.base, three.ours, three.theirs)
  if (fileLeaf.ok) {
    return { merged: fileLeaf.value as Record<string, Fields> | undefined, conflicts: [], stats: statsFor(fileLeaf.from) }
  }

  const result = mergeKeyedRecord3(three, (entryId, entry) => {
    const leaf = mergeLeaf3(entry.base, entry.ours, entry.theirs)
    if (leaf.ok) {
      return { value: leaf.value as Fields | undefined, conflicts: [], stats: statsFor(leaf.from) }
    }
    if (leaf.reason === 'delete_edit') {
      const candidate = {
        path: ctx.outPath, key: entryId, locale: ctx.locale,
        base: entry.base, ours: entry.ours, theirs: entry.theirs,
      }
      const resolution = ctx.resolutions.consume(candidate)
      if (resolution) {
        const value = resolvedValue(resolution, candidate) as Fields | undefined
        return { value, conflicts: [], stats: EMPTY_STATS }
      }
      return {
        value: entry.ours,
        conflicts: [makeConflict({
          ...candidate,
          kind: ctx.kind,
          model: ctx.model,
          code: 'delete_edit_conflict',
          message: `Entry "${entryId}" was deleted on one side and edited on the other in ${ctx.outPath}.`,
        })],
        stats: EMPTY_STATS,
      }
    }
    // Both sides changed the entry: merge field-wise.
    const fieldMerge = mergeEntryFields(entry, ctx, entryId)
    return {
      value: fieldMerge.merged,
      conflicts: fieldMerge.conflicts,
      stats: fieldMerge.conflicts.length === 0 ? { takenOurs: 0, takenTheirs: 0, fieldMerged: 1 } : EMPTY_STATS,
    }
  })
  return result
}

/** Singleton file: one record — straight field-level three-way. */
export function mergeSingletonFile(
  three: ThreeWay<Fields>,
  ctx: FileCtx,
): { merged: Fields | undefined, conflicts: ConflictItem[], stats: MergeStats } {
  const fileLeaf = mergeLeaf3(three.base, three.ours, three.theirs)
  if (fileLeaf.ok) {
    return { merged: fileLeaf.value as Fields | undefined, conflicts: [], stats: statsFor(fileLeaf.from) }
  }
  if (fileLeaf.reason === 'delete_edit') {
    const candidate = { path: ctx.outPath, locale: ctx.locale, base: three.base, ours: three.ours, theirs: three.theirs }
    const resolution = ctx.resolutions.consume(candidate)
    if (resolution) {
      return { merged: resolvedValue(resolution, candidate) as Fields | undefined, conflicts: [], stats: EMPTY_STATS }
    }
    return {
      merged: three.ours,
      conflicts: [makeConflict({
        ...candidate,
        kind: ctx.kind,
        model: ctx.model,
        code: 'delete_edit_conflict',
        message: `${ctx.outPath} was deleted on one side and edited on the other.`,
      })],
      stats: EMPTY_STATS,
    }
  }
  const fieldMerge = mergeEntryFields(three, ctx)
  return {
    merged: fieldMerge.merged,
    conflicts: fieldMerge.conflicts,
    stats: fieldMerge.conflicts.length === 0 ? { takenOurs: 0, takenTheirs: 0, fieldMerged: 1 } : EMPTY_STATS,
  }
}

/**
 * Dictionary file: keys are the identities, values are string leaves. The
 * three-way generalization of the inline upsert semantics: with an author
 * present (a save), the incoming value wins and is reported; with no
 * author (reconcile), two changed values are a question, not a pick.
 */
export function mergeDictionaryFile(
  three: ThreeWay<Record<string, string>>,
  ctx: FileCtx,
): { merged: Record<string, string> | undefined, conflicts: ConflictItem[], stats: MergeStats } {
  const fileLeaf = mergeLeaf3(three.base, three.ours, three.theirs)
  if (fileLeaf.ok) {
    return { merged: fileLeaf.value as Record<string, string> | undefined, conflicts: [], stats: statsFor(fileLeaf.from) }
  }

  return mergeKeyedRecord3(three, (key, item) => {
    const leaf = mergeLeaf3(item.base, item.ours, item.theirs)
    if (leaf.ok) {
      return { value: leaf.value as string | undefined, conflicts: [], stats: statsFor(leaf.from) }
    }
    const candidate = {
      path: ctx.outPath, key, locale: ctx.locale,
      base: item.base, ours: item.ours, theirs: item.theirs,
    }
    const resolution = ctx.resolutions.consume(candidate)
    if (resolution) {
      return { value: resolvedValue(resolution, candidate) as string | undefined, conflicts: [], stats: EMPTY_STATS }
    }
    return {
      value: item.ours,
      conflicts: [makeConflict({
        ...candidate,
        kind: 'dictionary',
        model: ctx.model,
        code: leaf.reason === 'delete_edit' ? 'delete_edit_conflict' : 'dictionary_value_conflict',
        message: leaf.reason === 'delete_edit'
          ? `Dictionary key "${key}" was deleted on one side and edited on the other in ${ctx.outPath}.`
          : `Dictionary key "${key}" has two different values in ${ctx.outPath}.`,
      })],
      stats: EMPTY_STATS,
    }
  })
}

/**
 * `normalize-sources.json`: keyed tooling metadata — merged with the
 * dictionary rule, values compared canonically whatever their shape.
 */
export function mergeKeyedJson(
  three: ThreeWay<Record<string, unknown>>,
  ctx: FileCtx,
): { merged: Record<string, unknown> | undefined, conflicts: ConflictItem[], stats: MergeStats } {
  const fileLeaf = mergeLeaf3(three.base, three.ours, three.theirs)
  if (fileLeaf.ok) {
    return { merged: fileLeaf.value as Record<string, unknown> | undefined, conflicts: [], stats: statsFor(fileLeaf.from) }
  }
  const result = mergeKeyedRecord3(three, (key, item) => {
    const leaf = mergeLeaf3(item.base, item.ours, item.theirs)
    if (leaf.ok) return { value: leaf.value, conflicts: [], stats: statsFor(leaf.from) }
    const candidate = { path: ctx.outPath, key, base: item.base, ours: item.ours, theirs: item.theirs }
    const resolution = ctx.resolutions.consume(candidate)
    if (resolution) return { value: resolvedValue(resolution, candidate), conflicts: [], stats: EMPTY_STATS }
    return {
      value: item.ours,
      conflicts: [makeConflict({
        ...candidate,
        kind: 'file',
        code: 'file_conflict',
        message: `Key "${key}" of ${ctx.outPath} was changed differently on both sides.`,
      })],
      stats: EMPTY_STATS,
    }
  })
  return { merged: result.merged, conflicts: result.conflicts, stats: result.stats }
}

/** Sum helper used by the orchestrator when it folds per-file stats. */
export { addStats }

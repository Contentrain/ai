import type { ConflictItem } from '@contentrain/types'
import type { FileCtx, MergeStats, ThreeWay } from './types.js'
import { EMPTY_STATS } from './types.js'
import { makeConflict, mergeKeyedRecord3, mergeLeaf3, statsFor } from './three-way.js'
import { resolvedValue } from './resolutions.js'

type MetaRecord = Record<string, unknown>

/**
 * Three-way merge of one entry's meta. Special fields:
 *
 * - `updated_at`: the later timestamp wins (ISO strings compare lexically);
 *   a present value beats an absent one.
 * - `updated_by`: follows the side that supplied the winning `updated_at`;
 *   with no timestamps to arbitrate, ours is kept and an advisory says so.
 * - `status`: a publish decision belongs to whoever made it — one side's
 *   change wins mechanically, but two different decisions are a question
 *   for a human, never a pick.
 *
 * Entry-level delete-vs-edit resolves mechanically to the edited side with
 * an advisory: meta is bookkeeping that trails content, and the CONTENT
 * delete-vs-edit conflict (reported separately) is the real question. The
 * orphan-meta validator catches any residue once that resolves.
 */
export function mergeEntryMeta3(
  three: ThreeWay<MetaRecord>,
  ctx: FileCtx,
  entryKey?: string,
): { merged: MetaRecord | undefined, conflicts: ConflictItem[], advisories: string[] } {
  const leaf = mergeLeaf3(three.base, three.ours, three.theirs)
  if (leaf.ok) return { merged: leaf.value as MetaRecord | undefined, conflicts: [], advisories: [] }
  if (leaf.reason === 'delete_edit') {
    const edited = leaf.deletedBy === 'ours' ? three.theirs : three.ours
    const label = entryKey ? `meta of "${entryKey}"` : `meta ${ctx.outPath}`
    return {
      merged: edited,
      conflicts: [],
      advisories: [`Kept the edited side of ${label} (deleted on the other) — bookkeeping follows the content decision.`],
    }
  }

  const conflicts: ConflictItem[] = []
  const advisories: string[] = []
  const merged: MetaRecord = {}

  // Arbitrate updated_at / updated_by together, before the generic fields.
  const oursAt = typeof three.ours?.['updated_at'] === 'string' ? three.ours['updated_at'] as string : undefined
  const theirsAt = typeof three.theirs?.['updated_at'] === 'string' ? three.theirs['updated_at'] as string : undefined
  let byWinner: 'ours' | 'theirs' | null = null
  if (oursAt !== undefined || theirsAt !== undefined) {
    if (oursAt === undefined) byWinner = 'theirs'
    else if (theirsAt === undefined) byWinner = 'ours'
    else byWinner = theirsAt > oursAt ? 'theirs' : 'ours'
    const winnerAt = byWinner === 'theirs' ? theirsAt : oursAt
    if (winnerAt !== undefined) merged['updated_at'] = winnerAt
  }

  const fields = [...new Set([
    ...Object.keys(three.base ?? {}),
    ...Object.keys(three.ours ?? {}),
    ...Object.keys(three.theirs ?? {}),
  ])].toSorted().filter(f => f !== 'updated_at')

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

    if (field === 'updated_by' && byWinner !== null) {
      const value = byWinner === 'theirs' ? candidate.theirs ?? candidate.ours : candidate.ours ?? candidate.theirs
      if (value !== undefined) merged[field] = value
      continue
    }

    const fieldLeaf = mergeLeaf3(candidate.base, candidate.ours, candidate.theirs)
    if (fieldLeaf.ok) {
      if (fieldLeaf.value !== undefined) merged[field] = fieldLeaf.value
      continue
    }

    if (field === 'updated_by') {
      // No timestamps to arbitrate — keep ours, say so.
      if (candidate.ours !== undefined) merged[field] = candidate.ours
      advisories.push(`${entryKey ? `"${entryKey}": ` : ''}updated_by differed with no updated_at to arbitrate — kept ours.`)
      continue
    }

    const resolution = ctx.resolutions.consume(candidate)
    if (resolution) {
      const value = resolvedValue(resolution, candidate)
      if (value !== undefined) merged[field] = value
      continue
    }

    if (candidate.ours !== undefined) merged[field] = candidate.ours
    conflicts.push(makeConflict({
      ...candidate,
      kind: 'meta',
      model: ctx.model,
      code: field === 'status' ? 'meta_status_conflict' : 'field_value_conflict',
      message: field === 'status'
        ? `Publish status of ${entryKey ? `entry "${entryKey}"` : ctx.outPath} was changed differently on both sides.`
        : `Meta field "${field}" of ${entryKey ? `entry "${entryKey}"` : ctx.outPath} differs on both sides.`,
    }))
  }

  return { merged, conflicts, advisories }
}

/**
 * A meta file: keyed by entry ID for collections, a single record
 * otherwise. Dispatch comes from the winning model definition — shapes are
 * never sniffed, because a dictionary meta record is indistinguishable
 * from a small collection map.
 */
export function mergeMetaFile(
  three: ThreeWay<MetaRecord>,
  ctx: FileCtx,
  perEntry: boolean,
): { merged: MetaRecord | undefined, conflicts: ConflictItem[], stats: MergeStats, advisories: string[] } {
  const fileLeaf = mergeLeaf3(three.base, three.ours, three.theirs)
  if (fileLeaf.ok) {
    return { merged: fileLeaf.value as MetaRecord | undefined, conflicts: [], stats: statsFor(fileLeaf.from), advisories: [] }
  }

  if (!perEntry) {
    const single = mergeEntryMeta3(three, ctx)
    return { merged: single.merged, conflicts: single.conflicts, stats: EMPTY_STATS, advisories: single.advisories }
  }

  const advisories: string[] = []
  const result = mergeKeyedRecord3(
    three as ThreeWay<Record<string, MetaRecord>>,
    (entryId, entry) => {
      const entryLeaf = mergeLeaf3(entry.base, entry.ours, entry.theirs)
      if (entryLeaf.ok) {
        return { value: entryLeaf.value as MetaRecord | undefined, conflicts: [], stats: statsFor(entryLeaf.from) }
      }
      const entryMerge = mergeEntryMeta3(entry, ctx, entryId)
      advisories.push(...entryMerge.advisories)
      return { value: entryMerge.merged, conflicts: entryMerge.conflicts, stats: EMPTY_STATS }
    },
  )
  return { merged: result.merged, conflicts: result.conflicts, stats: result.stats, advisories }
}

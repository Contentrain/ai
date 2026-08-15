import type { ConflictItem, Vocabulary } from '@contentrain/types'
import type { FileCtx, MergeStats, ThreeWay } from './types.js'
import { EMPTY_STATS, addStats } from './types.js'
import { makeConflict, mergeKeyedRecord3, mergeLeaf3, statsFor } from './three-way.js'
import { resolvedValue } from './resolutions.js'

type Terms = Record<string, Record<string, string>>

/**
 * Vocabulary three-way at TERM + LOCALE granularity — finer than the brief
 * asked for, and the reason the collabers scenario resolves with zero
 * human input: one side adding a term's Turkish while the other fixes its
 * English are different leaves, both win. Only the same term in the same
 * locale with two different translations is a question.
 *
 * Matches the inline save semantics (`planVocabularySave` merges
 * per-locale) — one policy family, two doors.
 */
export function mergeVocabulary(
  three: ThreeWay<Vocabulary>,
  ctx: FileCtx,
): { merged: Vocabulary | undefined, conflicts: ConflictItem[], stats: MergeStats } {
  const fileLeaf = mergeLeaf3(three.base, three.ours, three.theirs)
  if (fileLeaf.ok) {
    return { merged: fileLeaf.value as Vocabulary | undefined, conflicts: [], stats: statsFor(fileLeaf.from) }
  }

  const version = Math.max(three.base?.version ?? 1, three.ours?.version ?? 1, three.theirs?.version ?? 1)

  const termResult = mergeKeyedRecord3<Record<string, string>>(
    {
      base: three.base?.terms as Terms | undefined,
      ours: three.ours?.terms as Terms | undefined,
      theirs: three.theirs?.terms as Terms | undefined,
    },
    (term, item) => {
      const termLeaf = mergeLeaf3(item.base, item.ours, item.theirs)
      if (termLeaf.ok) {
        return { value: termLeaf.value as Record<string, string> | undefined, conflicts: [], stats: statsFor(termLeaf.from) }
      }
      if (termLeaf.reason === 'delete_edit') {
        const candidate = { path: ctx.outPath, key: term, base: item.base, ours: item.ours, theirs: item.theirs }
        const resolution = ctx.resolutions.consume(candidate)
        if (resolution) {
          return { value: resolvedValue(resolution, candidate) as Record<string, string> | undefined, conflicts: [], stats: EMPTY_STATS }
        }
        return {
          value: item.ours,
          conflicts: [makeConflict({
            ...candidate,
            kind: 'vocabulary',
            code: 'delete_edit_conflict',
            message: `Vocabulary term "${term}" was deleted on one side and edited on the other.`,
          })],
          stats: EMPTY_STATS,
        }
      }

      // Both sides touched the term: merge locale-by-locale.
      const inner = mergeKeyedRecord3<string>(item, (locale, translation) => {
        const leaf = mergeLeaf3(translation.base, translation.ours, translation.theirs)
        if (leaf.ok) {
          return { value: leaf.value as string | undefined, conflicts: [], stats: statsFor(leaf.from) }
        }
        const candidate = {
          path: ctx.outPath, key: term, locale,
          base: translation.base, ours: translation.ours, theirs: translation.theirs,
        }
        const resolution = ctx.resolutions.consume(candidate)
        if (resolution) {
          return { value: resolvedValue(resolution, candidate) as string | undefined, conflicts: [], stats: EMPTY_STATS }
        }
        return {
          value: translation.ours,
          conflicts: [makeConflict({
            ...candidate,
            kind: 'vocabulary',
            code: leaf.reason === 'delete_edit' ? 'delete_edit_conflict' : 'vocabulary_value_conflict',
            message: `Term "${term}" has two different "${locale}" translations.`,
          })],
          stats: EMPTY_STATS,
        }
      })
      return {
        value: Object.keys(inner.merged).length > 0 ? inner.merged : undefined,
        conflicts: inner.conflicts,
        stats: inner.conflicts.length === 0 ? addStats(inner.stats, { takenOurs: 0, takenTheirs: 0, fieldMerged: 1 }) : inner.stats,
      }
    },
  )

  return {
    merged: { version, terms: termResult.merged },
    conflicts: termResult.conflicts,
    stats: termResult.stats,
  }
}

// CommentsExport builder — the bridge from a migrated static site to a live
// comments service. Everything the receiving side needs travels here: the
// entry addresses (WordPress ids mean nothing after migration), the verbatim
// comments, and which threads were closed at the source.

import type { CommentsExport, EntrySourceMap, HandoffComments, RawIR } from '@contentrain/types'
import { COMMENTS_EXPORT_FORMAT, MIGRATION_CONTRACT_VERSION } from '@contentrain/types'

export function buildCommentsExport(raw: RawIR, entries: EntrySourceMap, opts?: { generated_at?: string }): CommentsExport {
  const threadsClosed = raw.posts.filter((p) => p.comment_status && p.comment_status !== 'open').map((p) => p.id)
  return {
    version: MIGRATION_CONTRACT_VERSION,
    format: COMMENTS_EXPORT_FORMAT,
    source: raw.provenance,
    site_url: raw.site.url || undefined,
    generated_at: opts?.generated_at ?? new Date().toISOString(),
    entries,
    threads_closed: threadsClosed.length ? threadsClosed : undefined,
    comments: raw.comments ?? [],
  }
}

/** Handoff summary for the export: counts + closed threads + what could not be addressed. */
export function summarizeComments(exp: CommentsExport): HandoffComments {
  const byStatus: Record<string, number> = {}
  const byType: Record<string, number> = {}
  const unresolved: Array<{ comment_id: number; post: number; reason: string }> = []
  for (const c of exp.comments) {
    byStatus[c.approved ?? '1'] = (byStatus[c.approved ?? '1'] ?? 0) + 1
    byType[c.type ?? 'comment'] = (byType[c.type ?? 'comment'] ?? 0) + 1
    if (!exp.entries[String(c.post)]) unresolved.push({ comment_id: c.id, post: c.post, reason: 'post has no entry mapping' })
  }
  return {
    total: exp.comments.length,
    by_status: byStatus,
    types: byType,
    export: { format: exp.format },
    threads_closed: exp.threads_closed,
    unresolved: unresolved.length ? unresolved : undefined,
  }
}

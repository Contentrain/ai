// CommentsExport builder — the bridge from a migrated static site to a live
// comments service. Everything the receiving side needs travels here: the
// entry addresses (WordPress ids mean nothing after migration), the verbatim
// comments, and which threads were closed at the source.

import type { CommentsExport, EntrySourceMap, HandoffComments, RawComment, RawIR } from '@contentrain/types'
import { COMMENTS_EXPORT_FORMAT, MIGRATION_CONTRACT_VERSION } from '@contentrain/types'

/**
 * The comments that may leave the source site (see `CommentsExport.comments`). An allowlist, so it
 * fails closed: a comment travels only when its entry is in this RawIR and public, and its status is
 * approved (`'1'`, or none) or pending (`'0'`). Everything else is counted in `excluded`: spam, trash,
 * WordPress's `post-trashed`, a plugin's own status, a post this RawIR does not hold.
 */
export function selectComments(raw: RawIR): { comments: RawComment[]; excluded: NonNullable<CommentsExport['excluded']> } {
  const posts = new Map(raw.posts.map((p) => [p.id, p]))
  const excluded: NonNullable<CommentsExport['excluded']> = {}
  const count = (key: keyof typeof excluded) => { excluded[key] = (excluded[key] ?? 0) + 1 }
  const comments: RawComment[] = []
  for (const c of raw.comments ?? []) {
    const post = posts.get(c.post)
    if (!post) { count('unknown_entry'); continue }
    if (post.status !== 'publish' || (post.password !== null && post.password !== undefined && post.password !== '')) { count('non_public_entry'); continue }
    const status = c.approved ?? '1'
    if (status === '1' || status === '0') { comments.push(c); continue }
    count(status === 'spam' ? 'spam' : status === 'trash' ? 'trash' : 'other_status')
  }
  return { comments, excluded }
}

export function buildCommentsExport(raw: RawIR, entries: EntrySourceMap, opts?: { generated_at?: string }): CommentsExport {
  const threadsClosed = raw.posts.filter((p) => p.comment_status && p.comment_status !== 'open').map((p) => p.id)
  const { comments, excluded } = selectComments(raw)
  return {
    version: MIGRATION_CONTRACT_VERSION,
    format: COMMENTS_EXPORT_FORMAT,
    source: raw.provenance,
    site_url: raw.site.url || undefined,
    generated_at: opts?.generated_at ?? new Date().toISOString(),
    entries,
    threads_closed: threadsClosed.length ? threadsClosed : undefined,
    comments,
    excluded: Object.keys(excluded).length ? excluded : undefined,
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
    excluded: exp.excluded,
  }
}

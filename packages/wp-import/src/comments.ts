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

/**
 * Comment meta keys that hold a commenter's personal data: IP, browser user
 * agent, e-mail, avatar URLs (a Gravatar URL carries the e-mail's hash). Same
 * list as Migrate's intake (`PII_META_KEY`), plus every `akismet_*` key:
 * `akismet_as_submitted` stores the whole submission (IP, user agent, e-mail,
 * referrer) and the rest is spam-check bookkeeping. Matched by key, so a
 * comment with no e-mail still loses its IP and user agent.
 */
export const COMMENT_PII_META_KEY = /(?:^|[_-])(?:ip|ip_address|author_ip|user_ip|agent|user_agent|author_agent|email|author_email|mail|avatar|avatar_url|avatar_urls|author_avatar_urls)$|^_?akismet_/i

/** Anything shaped like an e-mail address, anywhere in a serialized value. */
const EMAIL_RE = /[^\s@"'<>;:]+@[^\s@"'<>;:]+\.[a-z]{2,}/i

const serialized = (v: unknown): string => (typeof v === 'string' ? v : JSON.stringify(v) ?? '')

/**
 * A comment as it may leave the site. Meta under a personal-data key is always
 * dropped: IPs and user agents are never exported. Without `includeEmails`,
 * `email` becomes null and any remaining meta whose value holds an address is
 * dropped too (an unknown plugin's own key).
 */
function exportableComment(c: RawComment, includeEmails: boolean): RawComment {
  const out: RawComment = includeEmails ? { ...c } : { ...c, email: null }
  if (c.meta) {
    const kept = Object.entries(c.meta).filter(([k, v]) => !COMMENT_PII_META_KEY.test(k) && (includeEmails || !EMAIL_RE.test(serialized(v))))
    if (kept.length) out.meta = Object.fromEntries(kept)
    else delete out.meta
  }
  return out
}

export interface CommentsExportOptions {
  generated_at?: string
  /**
   * Carry commenter e-mail addresses. Default `false`: the export is written
   * next to the store and is personal data of third parties; a receiving
   * service that needs addresses asks for them. IPs, user agents and avatar
   * URLs are never carried, with or without this option.
   */
  includeEmails?: boolean
}

export function buildCommentsExport(raw: RawIR, entries: EntrySourceMap, opts?: CommentsExportOptions): CommentsExport {
  const threadsClosed = raw.posts.filter((p) => p.comment_status && p.comment_status !== 'open').map((p) => p.id)
  const selected = selectComments(raw)
  const excluded = selected.excluded
  const includeEmails = opts?.includeEmails === true
  const comments = selected.comments.map((c) => exportableComment(c, includeEmails))
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

// The approved comments a migration carried from the old site, rendered at build time so a delivered site shows its
// conversation from the first deploy, before (and without) a Studio binding. Written by the migration only when a site
// has any (`src/data/comments.json`); not content: editors do not see or edit it, Studio holds the live thread.
//
// Each comment is a display name, a date and plain text: no email, IP, avatar hash or author address ever reaches the
// file or the page. Bodies are text, rendered the way Studio's thread renders them (paragraphs, line breaks), so the
// static thread and the live one look the same and no markup from the old site is trusted.

/** One approved comment, as the migration wrote it. `parent` names the comment it answers, `null` at the top level. */
export interface StaticComment {
  id: string
  parent: string | null
  author: string
  /** ISO 8601. */
  date: string
  text: string
}

/** An entry's thread: its approved comments, and whether the old site had closed it to new ones. */
export interface StaticThread {
  closed: boolean
  comments: StaticComment[]
}

/** A comment with the replies under it, oldest first. */
export interface CommentNode extends StaticComment {
  depth: number
  replies: CommentNode[]
}

const FILE = import.meta.glob<{ default: Record<string, StaticThread> }>('/src/data/comments.json', { eager: true })

/** The thread of an entry (`posts`, its id), or undefined when the migration carried none for it. */
export function staticThreadOf(model: string, entry: string): StaticThread | undefined {
  const thread = Object.values(FILE)[0]?.default?.[`${model}/${entry}`]
  return thread && Array.isArray(thread.comments) && thread.comments.length ? thread : undefined
}

/**
 * The thread as a tree, oldest first at every level. A reply whose parent is not in the file (not approved, or a
 * pingback the migration left out) stands at the top level rather than vanish.
 */
export function commentTree(comments: readonly StaticComment[]): CommentNode[] {
  const byDate = comments.toSorted((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id, undefined, { numeric: true }))
  const ids = new Set(byDate.map(c => c.id))
  const children = new Map<string | null, StaticComment[]>()
  for (const c of byDate) {
    const parent = c.parent && ids.has(c.parent) && c.parent !== c.id ? c.parent : null
    children.set(parent, [...(children.get(parent) ?? []), c])
  }
  const seen = new Set<string>()
  const build = (parent: string | null, depth: number): CommentNode[] => (children.get(parent) ?? []).flatMap((c) => {
    if (seen.has(c.id)) return []
    seen.add(c.id)
    return [{ ...c, depth, replies: build(c.id, depth + 1) }]
  })
  return build(null, 0)
}

/** A comment's text as paragraphs (a blank line between them) with its line breaks, as Studio's thread shows it. */
export function paragraphsOf(text: string): string[][] {
  return text.split(/\n{2,}/).map(p => p.trim()).filter(Boolean).map(p => p.split('\n'))
}

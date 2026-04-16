/**
 * A single file change within a plan.
 *
 * - `content: string` — write or overwrite the file with this UTF-8 content.
 * - `content: null` — delete the file.
 *
 * Paths are content-root relative, use forward slashes, and must not contain
 * `..` segments or absolute anchors. Providers are responsible for resolving
 * paths against their backing store (worktree, git tree, etc.).
 */
export interface FileChange {
  path: string
  content: string | null
}

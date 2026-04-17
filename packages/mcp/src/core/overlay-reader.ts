import type { FileChange, RepoReader } from './contracts/index.js'

/**
 * A RepoReader that overlays a set of pending FileChanges on top of an
 * underlying reader. Used in the remote-provider write path so helpers
 * like {@link import('./context.js').buildContextChange} and
 * {@link import('./validator/project.js').validateProject} see the
 * post-change state — the state the pending commit is about to produce
 * — rather than the pre-change base branch.
 *
 * Semantics:
 *
 * - `readFile(path)` — returns pending `content` when the overlay maps
 *   the path; falls back to the base reader otherwise. A pending delete
 *   (`content: null`) surfaces as "missing" (throws, matching
 *   `RepoReader.readFile`'s missing-file contract).
 *
 * - `listDirectory(path)` — merges the base directory listing with
 *   pending additions that live directly in the same folder, removes
 *   entries whose pending change is a delete, and de-duplicates the
 *   result. Pending paths in nested subdirectories surface only at
 *   their own listings.
 *
 * - `fileExists(path)` — pending adds → `true`, pending deletes →
 *   `false`, otherwise delegates.
 *
 * The overlay keys are canonicalised to match the FileChange contract:
 * forward slashes, no leading `/`, no `..` segments (FileChanges are
 * required to respect these invariants).
 */
export class OverlayReader implements RepoReader {
  private readonly overlay: Map<string, FileChange>

  constructor(
    private readonly base: RepoReader,
    pendingChanges: FileChange[],
  ) {
    this.overlay = new Map()
    for (const change of pendingChanges) {
      this.overlay.set(normalise(change.path), change)
    }
  }

  async readFile(path: string, ref?: string): Promise<string> {
    const key = normalise(path)
    const pending = this.overlay.get(key)
    if (pending) {
      if (pending.content === null) {
        throw new Error(`OverlayReader: "${path}" is marked for deletion`)
      }
      return pending.content
    }
    return this.base.readFile(path, ref)
  }

  async listDirectory(path: string, ref?: string): Promise<string[]> {
    const baseEntries = await this.base.listDirectory(path, ref)
    const dirKey = normalise(path)
    const prefix = dirKey === '' ? '' : `${dirKey}/`

    const direct = [...this.overlay.entries()]
      .filter(([key]) => key.startsWith(prefix))
      .map(([key, change]) => ({
        name: key.slice(prefix.length).split('/')[0] ?? '',
        isNested: key.slice(prefix.length).includes('/'),
        deleted: change.content === null,
      }))
      .filter(entry => entry.name.length > 0)

    // For nested pending paths (e.g. overlay at `dir/sub/a.json` when
    // listing `dir`), the immediate child directory `sub` must surface
    // even though no pending change targets it directly.
    const deleted = new Set(
      direct.filter(e => e.deleted && !e.isNested).map(e => e.name),
    )
    const added = direct
      .filter(e => !e.deleted)
      .map(e => e.name)

    const result = baseEntries.filter(n => !deleted.has(n))
    for (const name of added) {
      if (!result.includes(name)) result.push(name)
    }
    return result
  }

  async fileExists(path: string, ref?: string): Promise<boolean> {
    const key = normalise(path)
    const pending = this.overlay.get(key)
    if (pending) return pending.content !== null
    return this.base.fileExists(path, ref)
  }
}

function normalise(path: string): string {
  return path.replace(/^\/+/, '')
}

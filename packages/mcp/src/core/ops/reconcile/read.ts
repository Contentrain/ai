import type { RepoReader } from '../../contracts/index.js'

/**
 * Per-side promise-memo over a `RepoReader`: every `(path)` read and listing
 * happens at most once for the whole plan, and concurrent duplicate requests
 * coalesce onto the same promise instead of racing. On a GitHub-backed
 * reader this is the difference between one API call per file and one per
 * phase that touches it.
 *
 * The `RepoReader` contract is preserved (`readFile` throws on a missing
 * file) so a `CachedReader` can be handed to `OverlayReader`,
 * `validateProject` and `buildContextChange` unchanged; the planner's own
 * code uses the null-tolerant extras.
 */
export class CachedReader implements RepoReader {
  private readonly files = new Map<string, Promise<string | null>>()
  private readonly dirs = new Map<string, Promise<string[]>>()
  private readonly exists = new Map<string, Promise<boolean>>()

  constructor(private readonly inner: RepoReader) {}

  /** Contract-shaped read: throws when missing. */
  async readFile(path: string, _ref?: string): Promise<string> {
    const content = await this.readOrNull(path)
    if (content === null) throw new Error(`ENOENT: no such file, open '${path}'`)
    return content
  }

  /** Planner-shaped read: `null` when missing, cached either way. */
  readOrNull(path: string): Promise<string | null> {
    let cached = this.files.get(path)
    if (!cached) {
      cached = this.inner.readFile(path).then(content => content, () => null)
      this.files.set(path, cached)
    }
    return cached
  }

  listDirectory(path: string, _ref?: string): Promise<string[]> {
    let cached = this.dirs.get(path)
    if (!cached) {
      cached = this.inner.listDirectory(path).then(entries => entries, () => [])
      this.dirs.set(path, cached)
    }
    return cached
  }

  fileExists(path: string, _ref?: string): Promise<boolean> {
    let cached = this.exists.get(path)
    if (!cached) {
      cached = this.inner.fileExists(path).then(v => v, () => false)
      this.exists.set(path, cached)
    }
    return cached
  }
}

/** Parse a JSON file, `null` when missing or unparseable. */
export async function readJsonOrNull<T>(reader: CachedReader, path: string): Promise<T | null> {
  const raw = await reader.readOrNull(path)
  if (raw === null) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

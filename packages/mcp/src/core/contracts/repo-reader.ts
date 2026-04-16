/**
 * Read-only interface to a content repository.
 *
 * Paths are relative to the repository's content root (e.g. `.contentrain/config.json`).
 * The `ref` parameter is a branch name, tag, or commit SHA. Providers that
 * operate on a single working tree (LocalReader) ignore `ref`; API-backed
 * providers use it to resolve the correct revision.
 *
 * `readFile` and `listDirectory` deliberately have different error semantics:
 * - `readFile` THROWS when the file is missing so callers must opt into
 *   tolerance explicitly (typically with a try/catch returning a default).
 * - `listDirectory` returns `[]` for a missing directory because the empty
 *   case is the common, uninteresting one.
 */
export interface RepoReader {
  /**
   * Read a file's contents as UTF-8.
   * @throws when the file does not exist or cannot be read.
   */
  readFile(path: string, ref?: string): Promise<string>

  /**
   * List file and directory names directly under `path`. Does not recurse.
   * Returns an empty array when the directory does not exist.
   */
  listDirectory(path: string, ref?: string): Promise<string[]>

  /** Check whether a file or directory exists at `path`. */
  fileExists(path: string, ref?: string): Promise<boolean>
}

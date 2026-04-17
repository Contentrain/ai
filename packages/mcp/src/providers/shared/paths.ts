/**
 * Normalise an optional contentRoot — strip leading/trailing slashes,
 * treat `''`, `/` and `undefined` as "no prefix". Used by API-backed
 * providers (GitHub, GitLab, future Bitbucket) to anchor content-relative
 * paths against a repo subdirectory when Contentrain lives under a
 * monorepo path like `apps/web/.contentrain/`.
 */
export function normaliseContentRoot(raw?: string): string {
  if (!raw || raw === '/' || raw === '') return ''
  return raw.replace(/^\/+|\/+$/g, '')
}

/**
 * Resolve a content-root-relative path to a repo-relative path. The result
 * always uses forward slashes and has no leading slash — the form every
 * REST git API consumes for `file_path` / `path` query parameters and the
 * Git Data API tree entries.
 */
export function resolveRepoPath(contentRoot: string | undefined, relativePath: string): string {
  const prefix = normaliseContentRoot(contentRoot)
  const cleanPath = relativePath.replace(/^\/+/, '')
  return prefix ? `${prefix}/${cleanPath}` : cleanPath
}

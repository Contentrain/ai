/**
 * Normalise an optional contentRoot — strip leading/trailing slashes,
 * treat `''`, `/` and `undefined` as "no prefix". Mirrors the GitHub
 * provider helper; kept in this package so the GitLab implementation
 * is self-contained.
 */
export function normaliseContentRoot(raw?: string): string {
  if (!raw || raw === '/' || raw === '') return ''
  return raw.replace(/^\/+|\/+$/g, '')
}

/**
 * Resolve a content-root-relative path to a repo-relative path. Paths
 * always use forward slashes and never lead with `/`, because that is
 * what the GitLab REST API consumes for `file_path` and `path` query
 * parameters.
 */
export function resolveRepoPath(contentRoot: string | undefined, relativePath: string): string {
  const prefix = normaliseContentRoot(contentRoot)
  const cleanPath = relativePath.replace(/^\/+/, '')
  return prefix ? `${prefix}/${cleanPath}` : cleanPath
}

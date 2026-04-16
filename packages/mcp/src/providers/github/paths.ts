/**
 * Normalise an optional contentRoot — strip leading/trailing slashes,
 * treat `''`, `/` and `undefined` as "no prefix".
 */
export function normaliseContentRoot(raw?: string): string {
  if (!raw || raw === '/' || raw === '') return ''
  return raw.replace(/^\/+|\/+$/g, '')
}

/**
 * Resolve a content-root-relative path to a repo-relative path. The
 * provider always stores paths in forward-slash, no leading slash form
 * because that is what the GitHub Git Data and Repos APIs consume.
 */
export function resolveRepoPath(contentRoot: string | undefined, relativePath: string): string {
  const prefix = normaliseContentRoot(contentRoot)
  const cleanPath = relativePath.replace(/^\/+/, '')
  return prefix ? `${prefix}/${cleanPath}` : cleanPath
}

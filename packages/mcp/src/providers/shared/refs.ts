/**
 * A full commit SHA: 40 hex digits. Where a provider accepts either a branch
 * name or a commit as a base, this is how it tells them apart. Only the full
 * form counts: an abbreviated SHA is read as a branch name. Git would allow a
 * branch named with 40 hex digits; such a name is read as a SHA here.
 */
export function isCommitSha(ref: string): boolean {
  return /^[0-9a-f]{40}$/i.test(ref)
}

import type { ValidationError } from '@contentrain/types'

/**
 * The entries a write targets, as the validation gate matches them: entry ID
 * for collections, slug for documents, locale alone for singletons and
 * dictionaries. Shared by content_save and content_status.
 */
export interface TargetedEntry {
  id?: string
  slug?: string
  locale?: string
}

/** Trim a validation issue to the fields that locate it, dropping empty ones. */
export function describeIssue(issue: ValidationError): Record<string, string> {
  const out: Record<string, string> = {}
  if (issue.entry) out['entry'] = issue.entry
  if (issue.slug) out['slug'] = issue.slug
  if (issue.locale) out['locale'] = issue.locale
  if (issue.field) out['field'] = issue.field
  out['message'] = issue.message
  return out
}

/**
 * Does a validation issue belong to one of the entries this save is writing?
 *
 * The write gate blocks on errors, but `validateProject` inspects the whole model.
 * Without this filter, a pre-existing bad entry somewhere else in the model would
 * block an unrelated — and perfectly valid — save, leaving the caller stuck behind
 * a problem they did not create and may not be able to fix.
 *
 * Matching is by identity: entry ID for collections, slug for documents, and
 * locale alone for singletons and dictionaries, which have one record per locale.
 */
export function touchesSavedEntries(
  issue: { entry?: string, slug?: string, locale?: string },
  results: TargetedEntry[],
): boolean {
  return results.some((r) => {
    if (issue.locale && r.locale && issue.locale !== r.locale) return false
    if (r.id) return issue.entry === r.id
    if (r.slug) return issue.slug === r.slug
    // Singleton / dictionary: the locale is the whole identity, and an issue with
    // no entry or slug is about the record itself.
    return !issue.entry && !issue.slug
  })
}

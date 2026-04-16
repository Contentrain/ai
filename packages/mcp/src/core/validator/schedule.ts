import type { EntryMeta, ValidationError } from '@contentrain/types'

/**
 * Validate `publish_at` and `expire_at` meta fields.
 *
 * Rules (matches legacy `validator.ts:validateScheduleFields`):
 * - `publish_at` must parse as a valid Date
 * - `expire_at` must parse as a valid Date
 * - When both are present, `expire_at` must be strictly after `publish_at`
 */
export function validateScheduleFields(
  meta: EntryMeta,
  ctx: { model: string, locale: string, entry?: string, slug?: string },
  issues: ValidationError[],
): void {
  if (meta.publish_at !== undefined) {
    const d = new Date(meta.publish_at)
    if (Number.isNaN(d.getTime())) {
      issues.push({
        severity: 'error',
        ...ctx,
        message: `Invalid publish_at date: "${meta.publish_at}". Must be a valid ISO 8601 date string.`,
      })
    }
  }
  if (meta.expire_at !== undefined) {
    const d = new Date(meta.expire_at)
    if (Number.isNaN(d.getTime())) {
      issues.push({
        severity: 'error',
        ...ctx,
        message: `Invalid expire_at date: "${meta.expire_at}". Must be a valid ISO 8601 date string.`,
      })
    }
  }
  if (meta.publish_at !== undefined && meta.expire_at !== undefined) {
    const pubDate = new Date(meta.publish_at)
    const expDate = new Date(meta.expire_at)
    if (!Number.isNaN(pubDate.getTime()) && !Number.isNaN(expDate.getTime()) && expDate <= pubDate) {
      issues.push({
        severity: 'error',
        ...ctx,
        message: `expire_at ("${meta.expire_at}") must be after publish_at ("${meta.publish_at}").`,
      })
    }
  }
}

// The contact details a migration kept on the site singleton (an ACF options page): the field
// names come from siteConfig.contact, the values from Contentrain, so an editor changes them in
// Studio. A field that is missing or empty yields nothing.
import type { LinkInput } from '../components/kit/_shared/types'
import type { SiteConfig } from '../site.config'

type SiteFields = Record<string, unknown>

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined

/** A row of a repeater is `{ <label field>, <url field> }` under names the editor chose: the link is the value that is an address, the label the other text. */
function rowLink(row: unknown): LinkInput | undefined {
  if (typeof row !== 'object' || row === null) return undefined
  const values = Object.values(row).map(text).filter((value): value is string => value !== undefined)
  const href = values.find(value => URL.canParse(value) && /^https?:/.test(value))
  if (!href) return undefined
  const label = values.find(value => value !== href) ?? new URL(href).hostname.replace(/^www\./, '')
  return { label, href }
}

export function siteContact(site: object, fields: SiteConfig['contact']) {
  const data = site as SiteFields
  const rows = fields?.socials ? data[fields.socials] : undefined
  return {
    address: fields?.address ? text(data[fields.address]) : undefined,
    phone: fields?.phone ? text(data[fields.phone]) : undefined,
    email: fields?.email ? text(data[fields.email]) : undefined,
    socials: Array.isArray(rows) ? rows.map(rowLink).filter((link): link is LinkInput => link !== undefined) : [],
  }
}

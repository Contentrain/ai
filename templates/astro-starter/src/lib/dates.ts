// Dates as the source site showed them. WordPress fills a post address's %year%/%monthnum%/%day% and prints its date
// from the post's local time (post_date), in the site's time zone; Contentrain stores the instant (published_at, UTC).
// Read in UTC, a post written in the evening of a UTC−n site lands on the next day: a different address than the one
// WordPress gave it (a 404 for every link to it) and a different printed date.

import { siteConfig } from '../site.config'

/** The zone the site's dates are read in: the source's own (`siteConfig.timeZone`), else UTC. */
export function siteTimeZone(): string {
  return siteConfig.timeZone ?? 'UTC'
}

/** A date's calendar day in `timeZone`, zero-padded as an address prints it (`2016`, `10`, `17`). */
export function dayParts(date: Date, timeZone = siteTimeZone()): { year: string, month: string, day: string } {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date)
  const part = (type: 'year' | 'month' | 'day') => parts.find(p => p.type === type)?.value ?? ''
  return { year: part('year'), month: part('month'), day: part('day') }
}

/** A date as a reader sees it (`October 17, 2016`), in the site's language and zone. */
export function formatDay(date: Date, locale: string, timeZone = siteTimeZone()): string {
  return date.toLocaleDateString(locale, { dateStyle: 'long', timeZone })
}

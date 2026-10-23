// The posts feed of the default language (of the site, in one language): see lib/feed.ts.
import type { APIRoute } from 'astro'
import { feed } from '../lib/feed'
import { defaultLocale } from '../lib/locales'

export const GET: APIRoute = ({ site }) => feed(defaultLocale, site)

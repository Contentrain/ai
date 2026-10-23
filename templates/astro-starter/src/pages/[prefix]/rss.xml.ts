// Each other language's posts feed, under its prefix (`/de/rss.xml`): see lib/feed.ts. A site in one language has none.
import type { APIRoute, GetStaticPaths } from 'astro'
import { feed } from '../../lib/feed'
import { siteLocales } from '../../lib/locales'

export const getStaticPaths = (() => siteLocales.slice(1).map(locale => ({ params: { prefix: locale.prefix }, props: { locale: locale.code } }))) satisfies GetStaticPaths

export const GET: APIRoute = ({ props, site }) => feed((props as { locale: string }).locale, site)

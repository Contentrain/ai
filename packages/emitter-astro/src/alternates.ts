// hreflang: which pages are translations of each other, and where each one is.
//
// Both halves come from what the emitter already holds, so neither can drift:
//
// - A translation group is the content-store entry. The importer folds the
//   translations of one post into one entry id across locales, and a post
//   carries that address as `EmitPost.entry` — the same key the comments
//   component threads by.
// - An address is computed from the route pattern and the post's own
//   parameters, the very values `getStaticPaths` hands Astro. The path printed
//   in a `<link rel="alternate">` is therefore the path Astro builds, not a
//   producer's recomputation of it.
//
// A post whose address is ambiguous gets no alternates. A wrong hreflang tells
// a search engine to serve the wrong page to a language's readers; a missing
// one only leaves it to work that out.

import type { RouteModel } from '@contentrain/types'
import type { EmitContent, EmitPost } from './types.js'
import { DEFAULT_COLLECTION } from './types.js'
import { collectionItems } from './pages.js'
import { patternToPagePath } from './util.js'

export interface Alternate {
  /** A language tag, or `x-default`. */
  lang: string
  /** Site-root-relative path, as the build serves it. */
  path: string
}

/**
 * The path Astro builds for a route pattern and a set of parameters, in the
 * directory format the scaffold configures (`/en/hello/`). Null when a
 * parameter has no value — that page has no address to name.
 */
export function entryPath(pattern: string, params: Record<string, string | undefined>): string | null {
  const segments = pattern.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean)
  if (!segments.length) return '/'
  const out: string[] = []
  for (const segment of segments) {
    if (!segment.startsWith(':')) {
      out.push(segment)
      continue
    }
    const value = params[segment.slice(1).replace(/\*$/, '')]?.replace(/^\/+|\/+$/g, '')
    if (!value) return null
    out.push(value)
  }
  return `/${out.join('/')}/`
}

interface Placement {
  lang: string
  path: string | null
  key?: string
  collection: string
}

export interface AlternatesResult {
  /** The content with `alternates` on every post that has translations. */
  content: EmitContent
  warnings: string[]
}

const byLangTag = (a: Alternate, b: Alternate) => (a.lang < b.lang ? -1 : a.lang > b.lang ? 1 : 0)

/**
 * Attach `alternates` to every entry that has translations on the site.
 *
 * The language of a page is the one its `<html lang>` gets: the post's own
 * locale, else its route's, else the site's. A site with one language has no
 * alternates and nothing is attached.
 */
export function withAlternates(routes: RouteModel[], content: EmitContent, siteLocale: string): AlternatesResult {
  const warnings: string[] = []
  const placements = new Map<EmitPost, Placement[]>()

  for (const route of routes) {
    if (route.kind !== 'single' && route.collection === undefined) continue
    const pagePath = patternToPagePath(route.pattern)
    if (!pagePath) continue
    const collection = route.collection ?? DEFAULT_COLLECTION
    const posts = collectionItems(content, collection)
    // A static route renders its one entry at the pattern itself; with more
    // than one entry the page throws at build, and there is no address.
    if (!pagePath.includes('[') && posts.length !== 1) continue
    for (const post of posts) {
      const list = placements.get(post) ?? []
      list.push({
        lang: post.locale ?? route.locale ?? siteLocale,
        path: entryPath(route.pattern, { ...post.params, slug: post.slug }),
        key: post.entry ? JSON.stringify([post.entry.model_id, post.entry.entry_id]) : undefined,
        collection,
      })
      placements.set(post, list)
    }
  }

  const langs = new Set([...placements.values()].flat().map((p) => p.lang))
  if (langs.size < 2) return { content, warnings }

  // One address per post: a post that two routes generate has two, and naming
  // either would be a guess.
  const groups = new Map<string, Array<{ post: EmitPost; lang: string; path: string }>>()
  const unkeyed = new Map<string, number>()
  const ambiguous = new Map<string, number>()
  for (const [post, list] of placements) {
    const first = list[0]!
    if (list.length > 1 || first.path === null) {
      ambiguous.set(first.collection, (ambiguous.get(first.collection) ?? 0) + 1)
      continue
    }
    if (!first.key) {
      unkeyed.set(first.collection, (unkeyed.get(first.collection) ?? 0) + 1)
      continue
    }
    const group = groups.get(first.key) ?? []
    group.push({ post, lang: first.lang, path: first.path })
    groups.set(first.key, group)
  }
  for (const [collection, count] of unkeyed) {
    warnings.push(`collection ${collection}: ${count} posts carry no entry address — hreflang cannot link them to their translations`)
  }
  for (const [collection, count] of ambiguous) {
    warnings.push(`collection ${collection}: ${count} posts have no single address (served by more than one route, or a route parameter without a value) — no hreflang on those pages`)
  }

  const alternatesOf = new Map<EmitPost, Alternate[]>()
  for (const group of groups.values()) {
    if (group.length < 2) continue
    const byLang = new Map<string, string>()
    let conflict = false
    for (const member of group) {
      const seen = byLang.get(member.lang)
      if (seen !== undefined && seen !== member.path) conflict = true
      byLang.set(member.lang, member.path)
    }
    const entry = group[0]!.post.entry!
    if (conflict) {
      warnings.push(`entry ${entry.model_id}/${entry.entry_id}: two pages claim the same language — no hreflang for this entry`)
      continue
    }
    if (byLang.size < 2) continue
    const alternates: Alternate[] = [...byLang].map(([lang, path]) => ({ lang, path })).toSorted(byLangTag)
    const fallback = byLang.get(siteLocale)
    if (fallback !== undefined) alternates.push({ lang: 'x-default', path: fallback })
    for (const member of group) alternatesOf.set(member.post, alternates)
  }
  if (!alternatesOf.size) return { content, warnings }

  const mark = (posts: EmitPost[]) => posts.map((post) => {
    const alternates = alternatesOf.get(post)
    return alternates ? { ...post, alternates } : post
  })
  return {
    content: {
      ...content,
      ...(content.posts ? { posts: mark(content.posts) } : {}),
      ...(content.collections
        ? { collections: Object.fromEntries(Object.entries(content.collections).map(([name, posts]) => [name, mark(posts)])) }
        : {}),
    },
    warnings,
  }
}

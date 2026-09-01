// Routes → Astro pages.
//
// Three shapes, matching what a migrated site actually needs:
// - `single`: one page per post, body injected with `set:html` inside the family layout.
// - list kinds (`archive`/`term`/`author`/`date`/`front` with a query): static
//   paths come from the producer's query data; items render through the
//   extracted item template when one exists.
// - static kinds (no query): the family chrome IS the page.
//
// Pagination is a route parameter (`/news/page/:page`), never a separate
// family — the generated paths simply include the page number in params.

import type { RouteModel, LayoutFamily } from '@contentrain/types'
import type { EmitContent, EmitPost, QueryPage } from './types.js'
import { DEFAULT_COLLECTION } from './types.js'
import { pascalCase, patternToPagePath, restParamIndex, stableJson } from './util.js'

export interface PageGenResult {
  files: Record<string, string>
  warnings: string[]
}

export function routeFiles(
  route: RouteModel,
  family: LayoutFamily | undefined,
  content: EmitContent,
  siteLocale: string,
): PageGenResult {
  const warnings: string[] = []
  const files: Record<string, string> = {}
  const pagePath = patternToPagePath(route.pattern)
  if (!pagePath) {
    return { files, warnings: [`route ${route.id}: pattern "${route.pattern}" cannot be expressed as an Astro page — skipped`] }
  }
  if (!family) {
    return { files, warnings: [`route ${route.id}: family "${route.family}" not found — skipped`] }
  }
  const layout = pascalCase(family.id)
  const depth = pagePath.split('/').length - 1
  const up = '../'.repeat(depth + 1) || '../'
  const hasParams = pagePath.includes('[')

  // Astro matches a rest parameter greedily, so anything after it is ambiguous.
  const restAt = restParamIndex(pagePath)
  if (restAt !== -1 && restAt !== pagePath.split('/').length - 1) {
    warnings.push(
      `route ${route.id}: rest parameter is not the final segment of "${route.pattern}" — Astro matches rest parameters greedily; verify this route resolves`,
    )
  }

  // Collection-driven: `single` always, and any route that names a collection —
  // a site's pages and custom post types are per-entry routes too, they just are
  // not called "single".
  if (route.kind === 'single' || route.collection !== undefined) {
    const collection = route.collection ?? DEFAULT_COLLECTION
    const posts = collectionItems(content, collection)
    if (!posts.length) {
      warnings.push(`route ${route.id}: collection "${collection}" has no items — page emitted, data file empty`)
    }
    files[`src/data/${collection}.json`] = stableJson(posts)
    files[`src/pages/${pagePath}`] = singlePage(route, layout, up, collection, siteLocale)
    return { files, warnings }
  }

  const queryPages: QueryPage[] = route.query ? (content.queries?.[route.query] ?? []) : []
  if (route.query) {
    if (!queryPages.length) warnings.push(`route ${route.id}: query "${route.query}" has no data — page emitted, data file empty`)
    if (queryPages.some((p) => !p.item_template && !p.sections?.length)) {
      warnings.push(`route ${route.id}: item template missing on some pages — plain fallback list rendered (not fidelity)`)
    }
    files[`src/data/queries/${route.query}.json`] = stableJson(queryPages)
    files[`src/pages/${pagePath}`] = listPage(route, layout, up, hasParams, siteLocale)
    return { files, warnings }
  }

  files[`src/pages/${pagePath}`] = staticPage(route, layout, up, hasParams, warnings, siteLocale)
  return { files, warnings }
}

/** Items of a named collection; `posts` also accepts the `content.posts` shorthand. */
function collectionItems(content: EmitContent, collection: string): EmitPost[] {
  const named = content.collections?.[collection]
  if (named) return named
  return collection === DEFAULT_COLLECTION ? (content.posts ?? []) : []
}

function singlePage(route: RouteModel, layout: string, up: string, collection: string, siteLocale: string): string {
  const locale = JSON.stringify(route.locale ?? siteLocale)
  return `---
// Route: ${route.id} (${route.pattern}) — collection: ${collection} — emitted by @contentrain/emitter-astro
import Layout from '${up}layouts/${layout}.astro'
import posts from '${up}data/${collection}.json'
import { postMarks } from '${up}lib/fill'

export function getStaticPaths() {
  // A post carries its own route parameters (date parts of a dated permalink,
  // a post id) — using the template post's would send every other post to the
  // wrong address.
  return posts.map((post) => ({ params: { ...(post.params ?? {}), slug: post.slug }, props: { post } }))
}
type Props = { post: (typeof posts)[number] }
const { post } = Astro.props as Props
---
<Layout
  title={post.title}
  marks={postMarks(post)}
  body={post.body}
  css={post.css ?? []}
  lang={post.locale ?? ${locale}}
/>
`
}

function listPage(route: RouteModel, layout: string, up: string, hasParams: boolean, siteLocale: string): string {
  const locale = JSON.stringify(route.locale ?? siteLocale)
  const routeTitle = JSON.stringify(route.title ?? '')
  const paths = hasParams
    ? `export function getStaticPaths() {
  return pages.map((page) => ({ params: page.params, props: { page } }))
}
type Props = { page: (typeof pages)[number] }
const { page } = Astro.props as Props`
    : `const page = pages[0] ?? { params: {}, items: [] }`
  return `---
// Route: ${route.id} (${route.pattern}) — emitted by @contentrain/emitter-astro
import Layout from '${up}layouts/${layout}.astro'
import pages from '${up}data/queries/${route.query}.json'
import { esc, postMarks, renderSections, renderTemplate } from '${up}lib/fill'

${paths}
// A list renders in sections (a big card then a grid) — one template is the
// single-section case. Without a template at all we fall back to a plain list
// and the emitter has already warned: silence would read as fidelity.
const sections = page.sections ?? (page.item_template ? [{ template: page.item_template }] : [])
const content = sections.length
  ? renderSections(sections, page.items, postMarks)
  : '<ul class="cr-post-list">' +
    page.items.map((item) => '<li><a href="/' + item.slug + '/">' + esc(item.title) + '</a></li>').join('') +
    '</ul>'
// Route params carry slugs; page marks carry what the chrome needs to SHOW
// (a term's display name, description, count).
const marks = { ...page.params, ...(page.marks ?? {}) }
const title = page.title ?? ${routeTitle} ?? ''
---
<Layout
  title={title || String(marks.term_name ?? page.params.term ?? '')}
  marks={marks}
  body={content}
  css={page.css ?? []}
  lang={${locale}}
/>
`
}

function staticPage(route: RouteModel, layout: string, up: string, hasParams: boolean, warnings: string[], siteLocale: string): string {
  if (hasParams) warnings.push(`route ${route.id}: parameterized route without a query — emitted with empty paths`)
  const paths = hasParams
    ? `export function getStaticPaths() {
  return []
}
`
    : ''
  return `---
// Route: ${route.id} (${route.pattern}) — emitted by @contentrain/emitter-astro
import Layout from '${up}layouts/${layout}.astro'
${paths}---
<Layout title=${JSON.stringify(route.title ?? '')} marks={{}} lang={${JSON.stringify(route.locale ?? siteLocale)}} />
`
}

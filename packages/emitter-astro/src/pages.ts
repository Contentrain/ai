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
import type { EmitContent, QueryPage } from './types.js'
import { pascalCase, patternToPagePath, stableJson } from './util.js'

export interface PageGenResult {
  files: Record<string, string>
  warnings: string[]
}

export function routeFiles(
  route: RouteModel,
  family: LayoutFamily | undefined,
  content: EmitContent,
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

  if (route.kind === 'single') {
    const posts = content.posts ?? []
    if (!posts.length) warnings.push(`route ${route.id}: single route with no posts — page emitted, data file empty`)
    files['src/data/posts.json'] = stableJson(posts)
    files[`src/pages/${pagePath}`] = singlePage(route, layout, up)
    return { files, warnings }
  }

  const queryPages: QueryPage[] = route.query ? (content.queries?.[route.query] ?? []) : []
  if (route.query) {
    if (!queryPages.length) warnings.push(`route ${route.id}: query "${route.query}" has no data — page emitted, data file empty`)
    if (queryPages.some((p) => !p.item_template)) {
      warnings.push(`route ${route.id}: item template missing on some pages — plain fallback list rendered (not fidelity)`)
    }
    files[`src/data/queries/${route.query}.json`] = stableJson(queryPages)
    files[`src/pages/${pagePath}`] = listPage(route, layout, up, hasParams)
    return { files, warnings }
  }

  files[`src/pages/${pagePath}`] = staticPage(route, layout, up, hasParams, warnings)
  return { files, warnings }
}

function singlePage(route: RouteModel, layout: string, up: string): string {
  return `---
// Route: ${route.id} (${route.pattern}) — emitted by @contentrain/emitter-astro
import Layout from '${up}layouts/${layout}.astro'
import posts from '${up}data/posts.json'
import { postMarks } from '${up}lib/fill'

export function getStaticPaths() {
  return posts.map((post) => ({ params: { slug: post.slug }, props: { post } }))
}
type Props = { post: (typeof posts)[number] }
const { post } = Astro.props as Props
---
<Layout title={post.title} marks={postMarks(post)} body={post.body} />
`
}

function listPage(route: RouteModel, layout: string, up: string, hasParams: boolean): string {
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
import { esc, fillMarks, postMarks } from '${up}lib/fill'

${paths}
const items = page.items.map((item) =>
  page.item_template ? fillMarks(page.item_template, postMarks(item)) : undefined,
)
const fallback = items.some((h) => h === undefined)
const content = fallback
  ? '<ul class="cr-post-list">' +
    page.items.map((item) => '<li><a href="/' + item.slug + '/">' + esc(item.title) + '</a></li>').join('') +
    '</ul>'
  : items.join('')
---
<Layout title={page.params.term ?? ''} marks={page.params} body={content} />
`
}

function staticPage(route: RouteModel, layout: string, up: string, hasParams: boolean, warnings: string[]): string {
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
<Layout title="" marks={{}} />
`
}

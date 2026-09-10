// @contentrain/emitter-astro — the open half of the migration pipeline.
//
// A ProjectIR (route model, layout families, component variants, query
// bindings, design tokens) plus prepared content goes in; a complete Astro
// project comes out as a pure file map. The analysis that *produces* a good
// ProjectIR is hard and lives elsewhere; rendering one is deliberately
// boring — which is exactly why it can be open, portable, and replaceable
// by community emitters for other frameworks.

import type { EmitInput, EmitPost, EmitResult } from './types.js'
import { DEFAULT_COLLECTION } from './types.js'
import { scaffoldFiles } from './scaffold.js'
import { componentMarkers, familyFiles } from './layouts.js'
import { collectionItems, routeFiles } from './pages.js'
import { componentFiles, isRuntimeImplemented } from './components.js'
import { chromeComponents } from './chrome.js'
import { SEO_COMPONENT } from './seo.js'
import { wrapLegacyCss } from './css.js'

export function emitAstroProject(input: EmitInput): EmitResult {
  const { ir } = input
  const warnings: string[] = []
  const files: Record<string, string> = {}
  const add = (batch: Record<string, string>) => {
    for (const [path, content] of Object.entries(batch)) {
      if (files[path] !== undefined && files[path] !== content) {
        warnings.push(`duplicate file with different content: ${path} — keeping the first`)
        continue
      }
      files[path] = content
    }
  }

  add(scaffoldFiles(ir, input.options ?? {}))

  // Per-page SEO is on unless the producer owns those tags itself.
  const seo = input.options?.seo !== false
  if (seo) {
    add({ 'src/components/Seo.astro': SEO_COMPONENT })
    if (!ir.site.url) {
      warnings.push('site.url is empty — canonical links and absolute og:url/og:image are omitted; set it so search engines and share cards resolve')
    }
  }

  const familiesById = new Map(ir.families.map((f) => [f.id, f]))
  const lang = ir.site.locales?.[0] ?? 'en'
  // Header/footer regions first: families that share one share the component.
  const chrome = chromeComponents(ir.families)
  add(chrome.files)
  warnings.push(...chrome.warnings)
  const definitions = new Map((ir.components ?? []).map((c) => [c.id, c]))
  // A component marker can sit inside a post's own body (a form in a page's
  // content). The layout that renders that body must mount it, so collect the
  // ids per family from the collections its routes render.
  const bodyMarkersByFamily = new Map<string, Set<string>>()
  for (const route of ir.routes) {
    if (route.kind !== 'single' && route.collection === undefined) continue
    const posts = collectionItems(input.content ?? {}, route.collection ?? DEFAULT_COLLECTION)
    const ids = bodyMarkersByFamily.get(route.family) ?? new Set<string>()
    for (const post of posts) for (const id of componentMarkers(post.body)) ids.add(id)
    if (ids.size) bodyMarkersByFamily.set(route.family, ids)
  }
  for (const family of ir.families) {
    const fam = familyFiles(family, lang, chrome.byFamily.get(family.id), definitions, bodyMarkersByFamily.get(family.id) ?? [], { seo, siteName: ir.site.title })
    add(fam.files)
    warnings.push(...fam.warnings)
  }

  for (const css of input.css ?? []) {
    const wrapped = wrapLegacyCss(css.path, css.content)
    if (wrapped.warning) warnings.push(wrapped.warning)
    const base = css.path.split('/').pop() ?? css.path
    add({ [`public/styles/legacy/${base}`]: wrapped.content })
  }
  const providedCss = new Set((input.css ?? []).map((c) => c.path.split('/').pop() ?? c.path))
  const missingCss = (refs: string[] | undefined, owner: string) => {
    for (const ref of refs ?? []) {
      if (!providedCss.has(ref.split('/').pop() ?? ref)) {
        warnings.push(`${owner}: css file "${ref}" not provided in input.css`)
      }
    }
  }
  for (const family of ir.families) missingCss(family.css.files, `family ${family.id}`)
  const allPosts = [
    ...(input.content?.posts ?? []),
    ...Object.values(input.content?.collections ?? {}).flat(),
  ]
  for (const post of allPosts) missingCss(post.css, `post ${post.slug}`)
  for (const [queryId, queryPages] of Object.entries(input.content?.queries ?? {})) {
    for (const qp of queryPages) missingCss(qp.css, `query ${queryId}`)
  }

  for (const route of ir.routes) {
    const result = routeFiles(route, familiesById.get(route.family), input.content ?? {}, lang, seo)
    add(result.files)
    warnings.push(...result.warnings)
  }

  const components = componentFiles(ir.components ?? [], input.runtime)
  add(components.files)
  warnings.push(...components.warnings)

  // A mounted comments thread is keyed by the post's entry address; a post
  // without one renders no thread. Say so once per collection, not per page.
  const commentsMounted = (ir.components ?? []).some((c) => isRuntimeImplemented(c, input.runtime) && c.type === 'comments')
  if (commentsMounted) {
    const collections: Record<string, EmitPost[]> = { ...input.content?.collections }
    if (input.content?.posts && !collections[DEFAULT_COLLECTION]) collections[DEFAULT_COLLECTION] = input.content.posts
    for (const [name, posts] of Object.entries(collections)) {
      const unbound = posts.filter((p) => !p.entry).length
      if (unbound) warnings.push(`collection ${name}: ${unbound} of ${posts.length} posts carry no entry address — the comments component renders nothing on those pages`)
    }
  }

  return { files, warnings }
}

/** Write an EmitResult to disk. Separate from emit so the core stays pure. */
export async function writeEmit(result: EmitResult, dir: string): Promise<void> {
  const { mkdir, writeFile } = await import('node:fs/promises')
  const { dirname, join } = await import('node:path')
  const dirs = new Set(Object.keys(result.files).map((p) => dirname(join(dir, p))))
  await Promise.all([...dirs].map((d) => mkdir(d, { recursive: true })))
  await Promise.all(
    Object.entries(result.files).map(([path, content]) => writeFile(join(dir, path), content, 'utf8')),
  )
}

export type {
  EmitInput,
  EmitResult,
  EmitContent,
  EmitPost,
  QueryPage,
  EmitCssFile,
  EmitOptions,
  EmitTermRef,
  RuntimeBinding,
  EntrySourceRef,
} from './types.js'
export { wrapLegacyCss } from './css.js'
export { pascalCase, patternToPagePath, stableJson } from './util.js'
export { componentMarkers } from './layouts.js'
export type { MountRef } from './layouts.js'
export { isRuntimeImplemented, RUNTIME_IMPLEMENTED } from './components.js'
export { stripSeoTags, SEO_COMPONENT } from './seo.js'
export type { StripResult } from './seo.js'
export { EMBED_TS } from './embed.js'
export { checkBalance, balanceWarning } from './balance.js'
export type { BalanceReport } from './balance.js'

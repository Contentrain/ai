// @contentrain/emitter-astro — the open half of the migration pipeline.
//
// A ProjectIR (route model, layout families, component variants, query
// bindings, design tokens) plus prepared content goes in; a complete Astro
// project comes out as a pure file map. The analysis that *produces* a good
// ProjectIR is hard and lives elsewhere; rendering one is deliberately
// boring — which is exactly why it can be open, portable, and replaceable
// by community emitters for other frameworks.

import type { RouteModel } from '@contentrain/types'
import type { EmitInput, EmitPost, EmitResult } from './types.js'
import { DEFAULT_COLLECTION } from './types.js'
import { scaffoldFiles } from './scaffold.js'
import { componentMarkers, familyFiles } from './layouts.js'
import { collectionItems, routeFiles } from './pages.js'
import { componentFiles, isRuntimeImplemented } from './components.js'
import { chromeComponents } from './chrome.js'
import { SEO_COMPONENT } from './seo.js'
import { withAlternates } from './alternates.js'
import { UI_STRINGS_DIR, uiStringsDir } from './ui-strings.js'
import { wrapLegacyCss } from './css.js'
import { stableJson } from './util.js'

export function emitAstroProject(input: EmitInput): EmitResult {
  const { ir } = input
  const warnings: string[] = []
  const files: Record<string, string> = {}
  const add = (batch: Record<string, string>) => {
    for (const [path, content] of Object.entries(batch)) {
      if (files[path] !== undefined && files[path] !== content) {
        // Pages are reported by the route loop below, which knows *which two
        // routes* collided and what is lost. Saying "duplicate file" here as
        // well would bury that under the vaguer message.
        if (!path.startsWith('src/pages/')) {
          warnings.push(`duplicate file with different content: ${path} — keeping the first`)
        }
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
  if (input.options?.sitemap !== false && !ir.site.url) {
    warnings.push('site.url is empty — no sitemap is generated and robots.txt names none; set it so search engines can find every page')
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
  // A placement may bind its region to a query. Validated before the families
  // are emitted, because the layout emits an import for the query's data file:
  // an import of a file the producer never supplied is a build error with no
  // explanation in it. A binding that does not check out is dropped here, so
  // the region stays the cloned markup the warning says it stays.
  const boundQueries = new Set<string>()
  const queryBound = new Set<string>()
  for (const family of ir.families) {
    for (const placement of family.components ?? []) {
      if (!placement.query) continue
      const pages = input.content?.queries?.[placement.query]
      if (!pages) {
        warnings.push(
          `family ${family.id}: placement "${placement.component}" binds query "${placement.query}", `
          + 'which is not in input.content.queries — binding dropped, region left as cloned markup',
        )
        continue
      }
      if (pages.length !== 1) {
        warnings.push(
          `family ${family.id}: placement "${placement.component}" binds query "${placement.query}", `
          + `which has ${pages.length} result sets — a page region has no route parameter to choose between `
          + 'them, so the build stops rather than rendering one of them everywhere',
        )
      } else if (!pages[0]!.item_template && !pages[0]!.sections?.length) {
        warnings.push(
          `family ${family.id}: placement "${placement.component}" binds query "${placement.query}", `
          + 'which has no item_template or sections — plain fallback list rendered (not fidelity)',
        )
      }
      // The layout imports this file. A route that renders the same query also
      // writes it, but a region is not a route: bound without one, nothing else
      // would, and the import would resolve to nothing.
      add({ [`src/data/queries/${placement.query}.json`]: stableJson(pages) })
      boundQueries.add(placement.query)
      queryBound.add(placement.component)
    }
  }

  for (const family of ir.families) {
    const fam = familyFiles(family, lang, chrome.byFamily.get(family.id), definitions, bodyMarkersByFamily.get(family.id) ?? [], { seo, siteName: ir.site.title, boundQueries })
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

  // Two routes can want the same Astro page. WordPress serves posts and pages
  // from the same root and tells them apart in the database; a static
  // generator cannot, so `/:slug` for posts and `/:slug` for pages resolve to
  // one file. Left to `add`, the second route's pages simply vanish — every
  // page of it, with a warning that names a file rather than a route, so the
  // producer learns a file was duplicated and not that a section of the site
  // is missing.
  //
  // The pages are unrecoverable at this point either way: the emitter cannot
  // know which route should own the path. What it can do is refuse to produce
  // a site that is quietly wrong.
  // hreflang alternates ride on the entry data, so they are attached before the
  // routes write it. The Seo component renders them; without it the producer
  // owns the head, alternates included.
  let routeContent = input.content ?? {}
  if (seo) {
    const alternates = withAlternates(ir.routes, routeContent, lang)
    routeContent = alternates.content
    warnings.push(...alternates.warnings)
  }
  const pageOwner = new Map<string, RouteModel>()
  const collisions: { path: string, first: RouteModel, second: RouteModel }[] = []
  for (const route of ir.routes) {
    const result = routeFiles(route, familiesById.get(route.family), routeContent, lang, seo)
    for (const path of Object.keys(result.files)) {
      if (!path.startsWith('src/pages/')) continue
      const owner = pageOwner.get(path)
      if (owner === undefined) {
        pageOwner.set(path, route)
        continue
      }
      // Any second claim on a page path is a collision, even when the two
      // routes would render the same thing: Astro serves one file per path, so
      // one of the two routes does not exist in the built site. Comparing the
      // emitted bytes instead would be a weaker test that happens to agree —
      // the page carries its route id in a comment, so two routes never
      // produce identical output anyway.
      collisions.push({ path, first: owner, second: route })
    }
    add(result.files)
    warnings.push(...result.warnings)
  }

  for (const { path, first, second } of collisions) {
    warnings.push(
      `route ${second.id}: pattern "${second.pattern}" emits the same Astro page as route ${first.id} `
      + `("${first.pattern}") — ${path}. Every page of "${second.id}" would be dropped, so the page now `
      + `fails the build instead. Give one route a distinct pattern, or expand the narrower one into literal routes.`,
    )
    files[path] = collisionPage(path, first, second)
  }

  const stringsDir = uiStringsDir(input.options?.uiStrings?.dir)
  if (stringsDir === undefined) {
    warnings.push(`options.uiStrings.dir "${input.options?.uiStrings?.dir}" is not a project-relative directory — using ${UI_STRINGS_DIR}`)
  }
  const components = componentFiles(ir.components ?? [], input.runtime, queryBound, stringsDir ?? UI_STRINGS_DIR)
  add(components.files)
  warnings.push(...components.warnings)
  // Comments and forms speak the page's language only if the dictionary has
  // it. The build reports a missing file too; saying it here puts it in the
  // same report as everything else the producer has to act on.
  if (components.files['src/lib/ui-strings.ts']) {
    const pageLangs = [...new Set([lang, ...ir.routes.map((r) => r.locale).filter((l): l is string => Boolean(l))])]
      .filter((l) => !l.toLowerCase().startsWith('en'))
    const declared = input.options?.uiStrings?.locales
    const uncovered = declared ? pageLangs.filter((l) => !declared.includes(l) && !declared.includes(l.split('-')[0]!)) : pageLangs
    if (uncovered.length) {
      warnings.push(
        `ui-strings: no dictionary ${declared ? 'declared' : 'declared in options.uiStrings.locales'} for ${uncovered.join(', ')} — `
        + `comments and forms on those pages show English text unless ${stringsDir ?? UI_STRINGS_DIR}/{locale}.json exists at build`,
      )
    }
  }

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

/**
 * Replaces a page two routes both claim. The emitter cannot choose between
 * them, so the page states the conflict and throws — `astro build` stops with
 * the two route ids in the message, instead of shipping a site that is missing
 * a section nobody was told about.
 */
function collisionPage(path: string, first: RouteModel, second: RouteModel): string {
  const message = `Route collision: "${first.id}" (${first.pattern}) and "${second.id}" (${second.pattern}) `
    + `both resolve to ${path}. A static build cannot serve both from one file — give one route a distinct `
    + `pattern, or expand the narrower one into literal routes.`
  const thrown = `throw new Error(${JSON.stringify(message)})`
  // On a dynamic path the throw has to live in `getStaticPaths`. Astro collects
  // paths before it renders anything, so a throw in the frontmatter would never
  // run — the build would fail on the missing `getStaticPaths` instead, with
  // Astro's generic message in place of the one that names the two routes.
  // On a static path the opposite holds: exporting `getStaticPaths` at all is
  // itself an error ("only supported in dynamic routes").
  return path.includes('[')
    ? `---\nexport function getStaticPaths() {\n  ${thrown}\n}\n---\n`
    : `---\n${thrown}\n---\n`
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
  ImageMeta,
  RuntimeBinding,
  EntrySourceRef,
} from './types.js'
export { wrapLegacyCss } from './css.js'
export { pascalCase, patternToPagePath, stableJson } from './util.js'
export { componentMarkers } from './layouts.js'
export type { MountRef } from './layouts.js'
export { isRuntimeImplemented, RUNTIME_IMPLEMENTED } from './components.js'
export { bodySeoLeaks, stripSeoTags, SEO_COMPONENT } from './seo.js'
export { entryPath, withAlternates } from './alternates.js'
export type { Alternate, AlternatesResult } from './alternates.js'
export type { StripResult } from './seo.js'
export { EMBED_TS } from './embed.js'
export { UI_STRING_DEFAULTS, UI_STRINGS_DIR, UI_STRINGS_MODEL } from './ui-strings.js'
export type { UiStringKey } from './ui-strings.js'
export { checkBalance, balanceWarning } from './balance.js'
export type { BalanceReport } from './balance.js'

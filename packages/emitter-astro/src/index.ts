// @contentrain/emitter-astro — the open half of the migration pipeline.
//
// A ProjectIR (route model, layout families, component variants, query
// bindings, design tokens) plus prepared content goes in; a complete Astro
// project comes out as a pure file map. The analysis that *produces* a good
// ProjectIR is hard and lives elsewhere; rendering one is deliberately
// boring — which is exactly why it can be open, portable, and replaceable
// by community emitters for other frameworks.

import type { RouteModel } from '@contentrain/types'
import type { EmitInput, EmitPost, EmitResult, RawRedirect } from './types.js'
import { DEFAULT_COLLECTION } from './types.js'
import { scaffoldFiles } from './scaffold.js'
import { imagesEnabled } from './images.js'
import { componentMarkers, familyFiles } from './layouts.js'
import { collectionItems, routeFiles, sharedCollectionPage } from './pages.js'
import { componentFiles, isRuntimeImplemented } from './components.js'
import { chromeComponents } from './chrome.js'
import { SEO_COMPONENT } from './seo.js'
import { entryPath, withAlternates } from './alternates.js'
import { UI_STRINGS_DIR, uiStringsDir } from './ui-strings.js'
import { wrapLegacyCss } from './css.js'
import { stableJson, patternToPagePath } from './util.js'
import { noindexPaths } from './noindex.js'
import { astroRedirectsConfig, builtAddresses, HOST_RULE_LIMIT, hostRedirectFiles, planRedirects } from './redirects.js'
import type { ManualRedirect } from './redirects.js'
import { FEED_PATH, FEED_REDIRECT_FROM, archiveFeedEndpoint, archiveFeedFile, archiveFeedSources, feedEndpoint, linkSources, llmsEndpoint, type LinkSource } from './feed.js'

/**
 * A supplied trail the build will not print — the same rule as \`validTrail\`
 * in the emitted runtime, which a test holds this to.
 */
function badTrail(trail: EmitPost['breadcrumbs']): boolean {
  return trail !== undefined && !(trail.length > 0 && trail.every((c) =>
    typeof c?.name === 'string' && c.name.trim() !== '' && typeof c.path === 'string' && !c.path.includes(String.fromCharCode(92)) && ![...c.path].some((char) => char.charCodeAt(0) <= 32) && /^\/(?!\/)/.test(c.path)))
}

/**
 * A source JSON-LD value the Seo component cannot print (see
 * `sourceStructuredData`): not an object, or no node in it names a type.
 */
function badSchema(schema: unknown): boolean {
  if (schema === undefined) return false
  if (!schema || typeof schema !== 'object') return true
  const graph = (schema as { '@graph'?: unknown })['@graph']
  const nodes: unknown[] = Array.isArray(schema) ? schema : Array.isArray(graph) ? graph : [schema]
  return !nodes.some((n) => {
    const type = n && typeof n === 'object' && !Array.isArray(n) ? (n as Record<string, unknown>)['@type'] : undefined
    return (Array.isArray(type) ? type : [type]).some((t) => typeof t === 'string')
  })
}

/** Redirect config sorted by `from`, the order astro.config and the host files list it in. */
function sortedConfig<T>(config: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(config).toSorted(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
}

/** A redirect's from as its config key: percent-encoding decoded, as planRedirects writes it. */
function decodedPath(from: string): string {
  try {
    return decodeURI(from)
  } catch {
    return from
  }
}

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

  // The site's own redirect rules. Only plain ones become config; the rest,
  // and any on an address this site builds a page at, go back to the producer.
  const siteLang = ir.site.locales?.[0] ?? 'en'
  // The feed and llms.txt name every page by its absolute address.
  const linkable = ir.site.url ? linkSources(ir.routes, siteLang) : []
  const feedSource = input.options?.feed !== false ? linkable.find((s) => s.collection === DEFAULT_COLLECTION) : undefined
  const llmsOn = input.options?.llms !== false && linkable.length > 0
  // Every archive page (a category, a tag, an author) gets its feed, as in WordPress.
  const archiveFeeds = feedSource ? archiveFeedSources(ir.routes, siteLang) : []
  const archiveFeedRoutes = new Set(archiveFeeds.map((a) => a.routeId))
  if (!ir.site.url && (input.options?.feed !== false || input.options?.llms !== false)) {
    warnings.push('site.url is empty — no RSS feed and no llms.txt are built; both name pages by absolute address')
  }
  const redirectPlan = input.redirects ? planRedirects(input.redirects, builtAddresses(ir.routes, input.content ?? {})) : undefined
  if (redirectPlan?.manual.length) {
    warnings.push(`redirects: ${redirectPlan.manual.length} of ${input.redirects!.length} rules not written to astro.config — set them up at the host (EmitResult.redirects.manual has each with its reason)`)
  }

  // Per-page SEO is on unless the producer owns those tags itself.
  const seo = input.options?.seo !== false
  const noindex = noindexPaths(ir.routes, input.content ?? {})
  // Readers subscribed to WordPress's /feed/ follow a 301 to the feed the
  // build writes — a real one from the host's redirect file; a static
  // redirect page, which feed readers do not follow, is only the fallback.
  // A rule the source itself holds for /feed/ wins.
  // The feed addresses WordPress served: /feed/ and each archive page's
  // <archive>/feed/, 301 to the feeds the build writes. They pass the same
  // checks as the source's rules — never over a page the site builds, never
  // a case twin of one — and a source rule for the same address wins.
  const built = builtAddresses(ir.routes, input.content ?? {})
  const sourceConfig = redirectPlan?.config ?? {}
  const claimed = new Set(Object.keys(sourceConfig).map((from) => from.replace(/\/+$/, '').toLowerCase()))
  const feedRules: RawRedirect[] = []
  const addFeedRule = (from: string, to: string) => {
    const key = from.replace(/\/+$/, '').toLowerCase()
    if (claimed.has(key)) return
    claimed.add(key)
    feedRules.push({ from, to, status: 301 })
  }
  if (feedSource) addFeedRule(FEED_REDIRECT_FROM, FEED_PATH)
  for (const source of archiveFeeds) {
    for (const page of input.content?.queries?.[source.query] ?? []) {
      const address = entryPath(source.pattern, page.params)
      if (address) addFeedRule(`${address}feed/`, `${address}feed.xml`)
    }
  }
  const feedPlan = planRedirects(feedRules, built)
  if (feedPlan.manual.length) {
    warnings.push(`feed: ${feedPlan.manual.length} feed redirects not written — ${feedPlan.manual.map((m) => `${m.redirect.from} (${m.reason})`).join('; ')}`)
  }
  const redirectConfig = { ...sourceConfig, ...feedPlan.config }
  const hasRedirects = Object.keys(redirectConfig).length > 0
  add(scaffoldFiles(ir, input.options ?? {}, noindex, hasRedirects ? astroRedirectsConfig(sortedConfig(redirectConfig)) : null, input.runtime))
  // Host-only rules: the same checks, then an address the site's own rules or
  // the feeds already redirect is theirs. Never in astro.config.
  const hostOnlyPlan = input.hostRedirects ? planRedirects(input.hostRedirects, built) : undefined
  const hostOnlyConfig: typeof redirectConfig = {}
  const hostOnlyRule = new Map<string, RawRedirect>()
  const hostOnlyManual: ManualRedirect[] = [...(hostOnlyPlan?.manual ?? [])]
  if (hostOnlyPlan) {
    const byFrom = new Map(hostOnlyPlan.written.map((rule) => [decodedPath(rule.from), rule]))
    for (const [from, rule] of Object.entries(hostOnlyPlan.config)) {
      const redirect = byFrom.get(from)!
      const key = from.replace(/\/+$/, '').toLowerCase()
      if (claimed.has(key)) {
        hostOnlyManual.push({ redirect, reason: `another rule already redirects ${from}` })
        continue
      }
      claimed.add(key)
      hostOnlyConfig[from] = rule
      hostOnlyRule.set(from, redirect)
    }
  }
  // Host files have a rule limit and keep the first rules: the source's own
  // come first, the feeds' after, so an overflow drops a feed redirect.
  // Among the feeds, /feed/ first, then the archives in their data order.
  const feedOrder = new Map(feedRules.map((rule, index) => [decodedPath(rule.from), index]))
  const feedKeys = Object.keys(feedPlan.config).toSorted((a, b) => (feedOrder.get(a) ?? 0) - (feedOrder.get(b) ?? 0))
  // Host-only rules come last: past a host's limit they are the ones left out.
  const hostOrder = { ...sortedConfig(sourceConfig), ...Object.fromEntries(feedKeys.map((key) => [key, feedPlan.config[key]!])), ...sortedConfig(hostOnlyConfig) }
  const hostRedirects = Object.keys(hostOrder).length ? hostRedirectFiles(hostOrder, input.options?.redirectHost) : undefined
  // A host-only rule the host file cannot hold has no meta-refresh page behind
  // it — it would not be served at all — so it is set up by hand.
  const hostOnly = (from: string) => hostOnlyRule.has(from)
  for (const from of hostRedirects?.skipped ?? []) {
    if (hostOnly(from)) hostOnlyManual.push({ redirect: hostOnlyRule.get(from)!, reason: 'from contains ":" or "*", which host redirect files read as a pattern' })
  }
  for (const from of hostRedirects?.over_limit ?? []) {
    if (hostOnly(from)) hostOnlyManual.push({ redirect: hostOnlyRule.get(from)!, reason: `left out of ${hostRedirects!.written.filter((f) => !f.includes('(netlify)')).join(', ')} at its rule limit (${HOST_RULE_LIMIT / 2} rules) — a host-only rule has no meta-refresh page to fall back on there` })
  }
  const unservedHostOnly = new Set(hostOnlyManual.map((m) => m.redirect))
  if (hostOnlyManual.length) {
    warnings.push(`hostRedirects: ${hostOnlyManual.length} of ${input.hostRedirects!.length} host-only rules not written — set them up at the host (EmitResult.redirects.manual has each with its reason)`)
  }
  if (hostRedirects) {
    add(hostRedirects.files)
    const overLimit = hostRedirects.over_limit.filter((from) => !hostOnly(from))
    const skippedPatterns = hostRedirects.skipped.filter((from) => !hostOnly(from))
    if (overLimit.length) {
      const limitedFiles = hostRedirects.written.filter((f) => !f.includes('(netlify)')).join(', ')
      const feedOver = overLimit.filter((from) => from in feedPlan.config).length
      const which = feedOver ? ` (${feedOver} of them feed redirects — /feed/ and archive feeds come after the site's own rules)` : ''
      warnings.push(`redirects: ${overLimit.length} rules not written to ${limitedFiles}${which} — ${HOST_RULE_LIMIT / 2} rules (each path with and without its slash) fill Cloudflare Pages' 2,000 static and Vercel's 2,048 redirect limit. They are served by the meta-refresh fallback only; move them to the host's dynamic rules for a real status`)
    }
    if (skippedPatterns.length) {
      warnings.push(`redirects: ${skippedPatterns.length} rules contain ":" or "*", which host redirect files read as patterns — served by the meta-refresh fallback only: ${skippedPatterns.join(', ')}`)
    }
  }

  // Without trailing slashes the build writes /hello.html; Vercel serves it
  // at /hello only with cleanUrls (Netlify and Cloudflare Pages do by default).
  if (input.options?.trailingSlash === false && (input.options.redirectHost ?? 'vercel') === 'vercel') {
    const vercel = files['vercel.json'] ? JSON.parse(files['vercel.json']) as Record<string, unknown> : {}
    files['vercel.json'] = `${JSON.stringify({ cleanUrls: true, trailingSlash: false, ...vercel }, null, 2)}\n`
  }

  if (noindex.length && !seo) {
    warnings.push(`${noindex.length} noindex pages: options.seo is false, so no robots meta is emitted — the producer's head must carry it (they are still left out of the sitemap)`)
  }
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
    const fam = familyFiles(family, lang, chrome.byFamily.get(family.id), definitions, bodyMarkersByFamily.get(family.id) ?? [], { seo, siteName: ir.site.title, boundQueries, images: imagesEnabled(input.options ?? {}), feedSite: feedSource ? ir.site.url : undefined, trailingSlash: input.options?.trailingSlash })
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
  // A breadcrumb trail with a bad crumb prints nothing at build; say so here.
  const trailOwners: Array<[string, EmitPost[] | undefined]> = [
    ...Object.entries(input.content?.collections ?? {}),
    ...(input.content?.posts ? [[DEFAULT_COLLECTION, input.content.posts] as [string, EmitPost[]]] : []),
  ]
  for (const [name, posts] of trailOwners) {
    const bad = (posts ?? []).filter((p) => badTrail(p.breadcrumbs)).length
    if (bad) warnings.push(`collection ${name}: ${bad} breadcrumb trails dropped — every crumb needs a name and a site-root-relative path`)
    const badLd = (posts ?? []).filter((p) => badSchema(p.schema)).length
    if (badLd) warnings.push(`collection ${name}: ${badLd} schema values are not JSON-LD objects — those pages print the generated structured data instead`)
  }
  for (const [queryId, queryPages] of Object.entries(input.content?.queries ?? {})) {
    const bad = queryPages.filter((qp) => badTrail(qp.breadcrumbs)).length
    if (bad) warnings.push(`query ${queryId}: ${bad} breadcrumb trails dropped — every crumb needs a name and a site-root-relative path`)
    const badLd = queryPages.filter((qp) => badSchema(qp.schema)).length
    if (badLd) warnings.push(`query ${queryId}: ${badLd} schema values are not JSON-LD objects — those pages print the generated structured data instead`)
  }

  // hreflang alternates ride on the entry data, so they are attached before the
  // routes write it. The Seo component renders them; without it the producer
  // owns the head, alternates included.
  let routeContent = input.content ?? {}
  if (seo) {
    const alternates = withAlternates(ir.routes, routeContent, lang)
    routeContent = alternates.content
    warnings.push(...alternates.warnings)
  }
  const routeGroups = new Map<string, RouteModel[]>()
  for (const route of ir.routes) {
    const path = patternToPagePath(route.pattern)
    if (path) routeGroups.set(path, [...(routeGroups.get(path) ?? []), route])
  }
  const sharedPages = new Map<string, string>()
  for (const [path, group] of routeGroups) {
    if (!group.every(route => familiesById.has(route.family))) continue
    const page = sharedCollectionPage(group, routeContent, lang, seo)
    if (page) sharedPages.set(`src/pages/${path}`, page)
  }
  const pageOwner = new Map<string, RouteModel>()
  const collisions: { path: string, first: RouteModel, second: RouteModel }[] = []
  for (const route of ir.routes) {
    const result = routeFiles(route, familiesById.get(route.family), routeContent, lang, seo, archiveFeedRoutes.has(route.id))
    for (const path of sharedPages.keys()) delete result.files[path]
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

  for (const [path, page] of sharedPages) files[path] = page

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

  // Endpoints over the data files the routes wrote; a collection whose file
  // was not written (its route was dropped) has no pages to list.
  const feedInput = { ir, siteLocale: lang, description: input.options?.siteDescription, trailingSlash: input.options?.trailingSlash !== false }
  const written = (source: LinkSource) => files[`src/data/${source.collection}.json`] !== undefined
  if (feedSource) {
    if (written(feedSource)) {
      add({ 'src/pages/feed.xml.ts': feedEndpoint(feedSource, feedInput) })
    } else {
      warnings.push(`feed: no posts data file was written, so no feed is built — the head's feed link points at ${FEED_PATH}, which 404s`)
    }
  }
  for (const source of archiveFeeds) {
    const file = archiveFeedFile(source.pattern)
    if (file && feedSource && files[`src/data/queries/${source.query}.json`] !== undefined) {
      add({ [file]: archiveFeedEndpoint(source, feedSource.pattern, feedInput) })
    }
  }
  if (llmsOn) {
    const listed = linkable.filter(written)
    if (listed.length) add({ 'src/pages/llms.txt.ts': llmsEndpoint(listed, feedInput) })
  }

  return {
    files,
    warnings,
    ...(redirectPlan || hostOnlyPlan
      ? {
          redirects: {
            written: [...(redirectPlan?.written ?? []), ...[...hostOnlyRule.values()].filter((rule) => !unservedHostOnly.has(rule))],
            manual: [...(redirectPlan?.manual ?? []), ...hostOnlyManual],
            host_files: hostRedirects?.written ?? [],
            // Host-only rules past the limit are in `manual`: nothing serves them.
            host_over_limit: (hostRedirects?.over_limit ?? []).filter((from) => !hostOnly(from)),
          },
        }
      : {}),
  }
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
  AuthorProfile,
  Breadcrumb,
  ImageMeta,
  SocialOverride,
  TwitterOverride,
  RuntimeBinding,
  RawRedirect,
  EntrySourceRef,
} from './types.js'
export { wrapLegacyCss } from './css.js'
export { FEED_ITEMS, FEED_PATH, LLMS_LINKS, linkSources, rewriteFeedLinks } from './feed.js'
export type { FeedLinkResult, LinkSource } from './feed.js'
export { pascalCase, patternToPagePath, stableJson } from './util.js'
export { componentMarkers } from './layouts.js'
export type { MountRef } from './layouts.js'
export { isRuntimeImplemented, RUNTIME_IMPLEMENTED } from './components.js'
export { bodySeoLeaks, publisherIdOf, stripSeoTags, websiteIdOf, SEO_COMPONENT } from './seo.js'
export { seoFromRawEntry } from './seo-entry.js'
export type { SeoFields, SeoFromRawOptions } from './seo-entry.js'
export { entryPath, withAlternates } from './alternates.js'
export type { Alternate, AlternatesResult } from './alternates.js'
export type { StripResult } from './seo.js'
export { EMBED_TS } from './embed.js'
export { UI_STRING_DEFAULTS, UI_STRINGS_DIR, UI_STRINGS_MODEL } from './ui-strings.js'
export type { UiStringKey } from './ui-strings.js'
export { checkBalance, balanceWarning } from './balance.js'
export { noindexPaths } from './noindex.js'
export { astroRedirectsConfig, builtAddresses, hostRedirectFiles, planRedirects, REDIRECT_STATUSES } from './redirects.js'
export type { HostRedirectFiles, ManualRedirect, RedirectHost, RedirectPlan, RedirectStatus } from './redirects.js'
export type { BalanceReport } from './balance.js'

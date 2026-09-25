// The files a plan's `site` owns in the starter: `src/site.config.ts`, the
// public address in `astro.config.mjs`, the `redirects` collection, the `@theme` block of
// `src/styles/global.css` and the WordPress presets rich-text bodies still use
// (`has-<slug>-color`, `has-<slug>-font-size`). Each is an edit of the
// starter's own file, so everything around the values — comments, the font
// setup, the utilities — stays as the starter wrote it.

import { createHash } from 'node:crypto'
import { canonicalStringify, footerMenusOf, type PlanSite, type PlanTokenRole } from '@contentrain/types'

const sq = (value: string) => `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`

/** Replace exactly one match of `pattern` in `source`, or fail: a starter edit that misses is a bug, not a no-op. */
function replaceOnce(source: string, pattern: RegExp, replacement: string, what: string): string {
  const matches = source.match(new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`))
  if (matches?.length !== 1) throw new Error(`starter ${what}: expected one match of ${pattern}, found ${matches?.length ?? 0}`)
  return source.replace(pattern, () => replacement)
}

/** The source site's host without `www.`, as the starter's links compare hosts. */
export function sourceHostsOf(url: string): string[] {
  try { return [new URL(url).hostname.toLowerCase().replace(/^www\./, '')] } catch { return [] }
}

/** Whether the starter reads its Studio binding from `studio.json` (see its astro.config.mjs). */
export const readsStudioJson = (starterSiteConfig: string): boolean => starterSiteConfig.includes('__CONTENTRAIN_STUDIO__')

/** `studio.json`: the plan's Studio binding, in the shape Studio writes when it moves the site's media (Migration → Media). */
export function studioJsonSource(site: PlanSite): string | undefined {
  return site.studio ? canonicalStringify({ baseUrl: site.studio.baseUrl, projectId: site.studio.projectId }) : undefined
}

export function siteConfigSource(starter: string, site: PlanSite, titleTemplate = '{title} – {site}'): string {
  const post = site.post ?? { header: ['terms', 'title', 'byline', 'cover'], adjacent: false, more: 0 }
  const lists = site.lists ?? { display: 'cards', heading: false }
  const p = site.permalinks
  const home = site.home.kind === 'page' ? `{ kind: 'page', slug: ${sq(site.home.slug)} }` : `{ kind: 'posts' }`
  // A starter that reads the binding from studio.json keeps its own line for it; the writer writes the file.
  const bound = /\n( {2}\.\.\.\(typeof __CONTENTRAIN_STUDIO__[^\n]*)/.exec(starter)?.[1]
  const studio = bound ? `\n${bound}` : site.studio ? `\n  studio: { baseUrl: ${sq(site.studio.baseUrl)}, projectId: ${sq(site.studio.projectId)} },` : ''
  // The source's host, fixed in code: links to it stay internal after the site moves domain in Studio.
  const sourceHosts = sourceHostsOf(site.url)
  const literal = `export const siteConfig: SiteConfig = {
  permalinks: {
    post: ${sq(p.post)},
    page: ${sq(p.page)},
    category: ${sq(p.category)},
    tag: ${sq(p.tag)},
    author: ${sq(p.author)},
    blog: ${sq(p.blog)},
  },
  home: ${home},
  titleTemplate: ${sq(titleTemplate)},
  postsPerPage: ${site.postsPerPage},
  menus: { primary: ${sq(site.menus.primary)}, footer: [${footerMenusOf(site).map(sq).join(', ')}] },
  post: { header: [${post.header.map(sq).join(', ')}], adjacent: ${post.adjacent}, more: ${post.more} },
  lists: { display: ${sq(lists.display)}, heading: ${lists.heading} },
  sourceHosts: [${sourceHosts.map(sq).join(', ')}],${studio}
}
`
  return replaceOnce(starter, /export const siteConfig: SiteConfig = \{[\s\S]*\n\}\n/, literal, 'site.config.ts')
}

/**
 * The site's address, and the extra hosts astro:assets may fetch images from. The source site is not
 * one of them: its media is copied into public/ before the build, and the build never reaches back to
 * the old origin (which may be switched off, or be this site after the cut-over).
 */
export function astroConfigSource(starter: string, site: PlanSite, imageHosts: readonly string[]): string {
  const url = new URL(site.url)
  let out = replaceOnce(starter, /const site = '[^']*'/, `const site = ${sq(url.origin)}`, 'astro.config site')
  const hosts = [...new Set(imageHosts)].filter(host => host !== url.hostname).toSorted()
  out = replaceOnce(out, /domains: \[[^\]]*\]/, `domains: [${hosts.map(sq).join(', ')}]`, 'astro.config image.domains')
  return out
}

/** Where the redirects collection's entries live (non-i18n collection, domain `site`). */
export const REDIRECTS_CONTENT = '.contentrain/content/site/redirects/data.json'

/**
 * The plan's redirects as entries of the `redirects` collection, which editors then keep in Studio.
 * An entry's id is derived from its old address, so a re-run updates the same entry; entries already in
 * the store for other addresses (an editor's) stay as they are.
 */
export function redirectsContent(existing: Record<string, Record<string, unknown>>, site: PlanSite): string {
  const out: Record<string, Record<string, unknown>> = { ...existing }
  for (const [from, rule] of Object.entries(site.redirects)) {
    const id = createHash('sha256').update(from).digest('hex').slice(0, 12)
    const status = typeof rule === 'string' ? 301 : rule.status
    const to = typeof rule === 'string' ? rule : rule.destination
    out[id] = status === 410 ? { from, status } : { from, status, to }
  }
  return canonicalStringify(out)
}

/** A CSS value safe to put in a declaration: no block or declaration breaks. */
function cssValue(value: string, what: string): string {
  if (/[;{}<>]|\/\*|\*\//.test(value) || /\burl\s*\(/i.test(value) || value.trim() === '') throw new Error(`${what}: "${value}" is not a plain CSS value`)
  return value.trim()
}

const cssName = (name: string, what: string): string => {
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(name)) throw new Error(`${what}: "${name}" is not a CSS identifier`)
  return name
}

/**
 * The `@theme` block with the plan's role values and the site's own scale. A role the plan leaves out
 * keeps the starter's value; `font-sans` keeps the self-hosted Inter unless the plan names a family.
 */
export function themeSource(starter: string, tokens: PlanSite['tokens']): string {
  const block = /@theme \{\n([\s\S]*?)\n\}/.exec(starter)
  if (!block) throw new Error('starter global.css: no @theme block')
  let body = block[1]!
  const added: string[] = []
  for (const [role, value] of Object.entries(tokens.roles) as Array<[PlanTokenRole, string]>) {
    const line = new RegExp(`(\\n?\\s*--${role}: )[^;]*;`)
    const css = cssValue(value, `tokens.roles.${role}`)
    // A role the starter leaves to the kit's fallback (heading weight, body size, radii, gutter) is added.
    if (line.test(body)) body = body.replace(line, (_m, head: string) => `${head}${css};`)
    else added.push(`  --${role}: ${css};`)
  }

  const extra = Object.entries(tokens.extra ?? {}).toSorted(([a], [b]) => a.localeCompare(b))
  if (extra.length) {
    body += `\n\n  /* The source site's own scale (theme.json presets), beside the roles. */\n${extra.map(([name, value]) => `  --${cssName(name, 'tokens.extra')}: ${cssValue(value, `tokens.extra.${name}`)};`).join('\n')}`
  }
  // Outside @theme, which drops variables no utility uses: the kit reads these through var() fallbacks.
  const root = added.length ? `\n\n/* The source theme's type and shape; without them the kit uses its own values. */\n:root {\n${added.join('\n')}\n}` : ''
  const markers = markerRules(tokens.roles)
  const rules = markers.length ? `\n\n/* The source theme's type scale and rhythm on the kit's markers. Unlayered, so they beat the utilities. */\n${markers.join('\n')}` : ''
  return `${starter.slice(0, block.index)}@theme {\n${body}\n}${root}${rules}${starter.slice(block.index + block[0].length)}`
}

/** Roles no component reads: each is a rule on the kit's markers, written only when the plan sets the role. */
const MARKER_RULES: Array<[string, string]> = [
  ['text-heading-1', 'main h1 { font-size: var(--text-heading-1); }'],
  ['text-heading-2', 'main h2 { font-size: var(--text-heading-2); }'],
  ['text-heading-3', 'main h3 { font-size: var(--text-heading-3); }'],
  ['text-body', '[data-kit-text] { font-size: var(--text-body); line-height: var(--leading-body, inherit); }'],
  ['text-nav', '[data-cr-part="nav-header"] :is(a, summary) { font-size: var(--text-nav); }'],
  ['spacing-section', '[data-kit-section]:not([data-kit-spacing="none"]) { padding-block: var(--spacing-section); }'],
]

function markerRules(roles: PlanSite['tokens']['roles']): string[] {
  return MARKER_RULES.filter(([role]) => (roles as Record<string, string | undefined>)[role] !== undefined).map(([, rule]) => rule)
}

const PRESET_RULES: Record<string, (slug: string) => string[]> = {
  'color': slug => [`.has-${slug}-color { color: var(--wp--preset--color--${slug}); }`, `.has-${slug}-background-color { background-color: var(--wp--preset--color--${slug}); }`, `.has-${slug}-border-color { border-color: var(--wp--preset--color--${slug}); }`],
  'font-size': slug => [`.has-${slug}-font-size { font-size: var(--wp--preset--font-size--${slug}); }`],
  'font-family': slug => [`.has-${slug}-font-family { font-family: var(--wp--preset--font-family--${slug}); }`],
  'spacing': () => [],
  'shadow': () => [],
}

/**
 * `src/styles/wp-presets.css`: the source theme's presets as `--wp--preset--*` custom properties and the
 * `has-*` classes rich-text bodies carry. Undefined when the plan has none.
 */
export function presetsSource(tokens: PlanSite['tokens']): string | undefined {
  const presets = Object.entries(tokens.presets ?? {}).filter(([, values]) => values && Object.keys(values).length)
  if (!presets.length) return undefined
  const vars: string[] = []
  const rules: string[] = []
  for (const [kind, values] of presets.toSorted(([a], [b]) => a.localeCompare(b))) {
    for (const [slug, value] of Object.entries(values!).toSorted(([a], [b]) => a.localeCompare(b))) {
      vars.push(`  --wp--preset--${kind}--${cssName(slug, `presets.${kind}`)}: ${cssValue(value, `presets.${kind}.${slug}`)};`)
      rules.push(...(PRESET_RULES[kind]?.(slug) ?? []))
    }
  }
  return `/*
 * The source WordPress theme's presets. Rich-text bodies keep the classes the
 * block editor wrote (has-accent-1-color, has-large-font-size); these rules
 * give them the theme's values. Generated from the migration plan.
 */
:root {
${vars.join('\n')}
}
${rules.length ? `\n${rules.join('\n')}\n` : ''}`
}

/** `global.css` importing the presets after the block styles. */
export function withPresetsImport(globalCss: string): string {
  if (globalCss.includes("@import './wp-presets.css'")) return globalCss
  return replaceOnce(globalCss, /@import '\.\/wp-blocks\.css';\n/, "@import './wp-blocks.css';\n@import './wp-presets.css';\n", 'global.css wp-blocks import')
}

type PlanFont = NonNullable<PlanSite['tokens']['fonts']>[number]

/** CSS variable Astro's font API defines for a self-hosted family: `Fira Code` → `--font-site-fira-code`. */
export const fontVariable = (family: string) => `--font-site-${family.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`

/** Faces by family, each file a project-relative path under src/ (the media stage puts them in src/assets/fonts/site/). */
function familiesOf(fonts: readonly PlanFont[]): Map<string, PlanFont[]> {
  const families = new Map<string, PlanFont[]>()
  for (const face of fonts) {
    for (const file of face.files) {
      if (!/^src\/[\w./-]+\.(?:woff2|woff|ttf|otf)$/.test(file) || file.includes('..')) throw new Error(`font ${face.family}: "${file}" is not a local font file under src/`)
    }
    if (!/^[\w .-]+$/.test(face.family)) throw new Error(`font family "${face.family}" has characters a config cannot carry`)
    ;(families.get(face.family) ?? families.set(face.family, []).get(face.family)!).push(face)
  }
  return families
}

/** astro.config.mjs with the site's own fonts before the starter's Inter. */
export function withSiteFonts(astroConfig: string, fonts: readonly PlanFont[]): string {
  if (!fonts.length) return astroConfig
  const entries = [...familiesOf(fonts)].map(([family, faces]) => `    {
      provider: fontProviders.local(),
      name: ${sq(family)},
      cssVariable: ${sq(fontVariable(family))},
      fallbacks: ['ui-sans-serif', 'system-ui', 'sans-serif'],
      options: {
        variants: [
${faces.map(face => `          { src: [${face.files.map(file => sq(`./${file}`)).join(', ')}], weight: ${sq(face.weight)}, style: ${sq(face.style)}${face.unicodeRange ? `, unicodeRange: [${sq(face.unicodeRange)}]` : ''} },`).join('\n')}
        ],
      },
    },`).join('\n')
  return replaceOnce(astroConfig, /  fonts: \[\n/, `  // The source site's own fonts, self-hosted.\n  fonts: [\n${entries}\n`, 'astro.config fonts')
}

/** BaseLayout loading the site's fonts beside Inter. */
export function withSiteFontTags(layout: string, fonts: readonly PlanFont[]): string {
  if (!fonts.length) return layout
  const tags = [...familiesOf(fonts).keys()].map(family => `    <Font cssVariable=${JSON.stringify(fontVariable(family))} preload />`).join('\n')
  return replaceOnce(layout, /    <Font cssVariable="--font-inter" preload \/>\n/, `    <Font cssVariable="--font-inter" preload />\n${tags}\n`, 'BaseLayout font tag')
}

/**
 * Font roles pointing at a self-hosted family through its variable: `Manrope, sans-serif` becomes
 * `var(--font-site-manrope)` (the variable carries the fallbacks). Other values are kept.
 */
export function fontRoles(tokens: PlanSite['tokens']): PlanSite['tokens'] {
  const hosted = new Set((tokens.fonts ?? []).map(face => face.family.toLowerCase()))
  if (!hosted.size) return tokens
  const roles = { ...tokens.roles }
  for (const role of ['font-sans', 'font-serif', 'font-mono'] as const) {
    const first = roles[role]?.split(',')[0]?.trim().replace(/^["']|["']$/g, '')
    const family = (tokens.fonts ?? []).find(face => face.family.toLowerCase() === first?.toLowerCase())?.family
    if (family) roles[role] = `var(${fontVariable(family)})`
  }
  return { ...tokens, roles }
}

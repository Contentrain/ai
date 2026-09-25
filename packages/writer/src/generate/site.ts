// The files a plan's `site` owns in the starter: `src/site.config.ts`, the
// public address in `astro.config.mjs`, `redirects.json`, the `@theme` block of
// `src/styles/global.css` and the WordPress presets rich-text bodies still use
// (`has-<slug>-color`, `has-<slug>-font-size`). Each is an edit of the
// starter's own file, so everything around the values — comments, the font
// setup, the utilities — stays as the starter wrote it.

import type { PlanSite, PlanTokenRole } from '@contentrain/types'

const sq = (value: string) => `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`

/** Replace exactly one match of `pattern` in `source`, or fail: a starter edit that misses is a bug, not a no-op. */
function replaceOnce(source: string, pattern: RegExp, replacement: string, what: string): string {
  const matches = source.match(new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`))
  if (matches?.length !== 1) throw new Error(`starter ${what}: expected one match of ${pattern}, found ${matches?.length ?? 0}`)
  return source.replace(pattern, () => replacement)
}

export function siteConfigSource(starter: string, site: PlanSite): string {
  const p = site.permalinks
  const home = site.home.kind === 'page' ? `{ kind: 'page', slug: ${sq(site.home.slug)} }` : `{ kind: 'posts' }`
  const studio = site.studio ? `\n  studio: { baseUrl: ${sq(site.studio.baseUrl)}, projectId: ${sq(site.studio.projectId)} },` : ''
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
  postsPerPage: ${site.postsPerPage},
  menus: { primary: ${sq(site.menus.primary)}, footer: ${sq(site.menus.footer)} },${studio}
}
`
  return replaceOnce(starter, /export const siteConfig: SiteConfig = \{[\s\S]*\n\}\n/, literal, 'site.config.ts')
}

export function astroConfigSource(starter: string, site: PlanSite, imageHosts: readonly string[]): string {
  const url = new URL(site.url)
  let out = replaceOnce(starter, /const site = '[^']*'/, `const site = ${sq(url.origin)}`, 'astro.config site')
  const hosts = [...new Set([url.hostname, ...imageHosts])].toSorted()
  out = replaceOnce(out, /domains: \[[^\]]*\]/, `domains: [${hosts.map(sq).join(', ')}]`, 'astro.config image.domains')
  return out
}

export function redirectsSource(site: PlanSite): string {
  const sorted = Object.fromEntries(Object.entries(site.redirects).toSorted(([a], [b]) => a.localeCompare(b)))
  return `${JSON.stringify(sorted, null, 2)}\n`
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
  for (const [role, value] of Object.entries(tokens.roles) as Array<[PlanTokenRole, string]>) {
    const line = new RegExp(`(\\n?\\s*--${role}: )[^;]*;`)
    if (!line.test(body)) throw new Error(`starter global.css: @theme has no --${role}`)
    body = body.replace(line, (_m, head: string) => `${head}${cssValue(value, `tokens.roles.${role}`)};`)
  }
  const extra = Object.entries(tokens.extra ?? {}).toSorted(([a], [b]) => a.localeCompare(b))
  if (extra.length) {
    body += `\n\n  /* The source site's own scale (theme.json presets), beside the roles. */\n${extra.map(([name, value]) => `  --${cssName(name, 'tokens.extra')}: ${cssValue(value, `tokens.extra.${name}`)};`).join('\n')}`
  }
  return `${starter.slice(0, block.index)}@theme {\n${body}\n}${starter.slice(block.index + block[0].length)}`
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

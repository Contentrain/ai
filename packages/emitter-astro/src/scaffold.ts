// Project scaffolding: manifest, config, styles, and the shared fill helper
// the generated pages use to pour content into `@@mark@@` placeholders.

import type { DesignTokens, ProjectIR } from '@contentrain/types'
import type { EmitOptions } from './types.js'
import { stableJson } from './util.js'

export function scaffoldFiles(ir: ProjectIR, options: EmitOptions): Record<string, string> {
  const tailwind = options.tailwind !== false
  const split = ir.viewport_strategy === 'split'
  const files: Record<string, string> = {}

  const pkg: Record<string, unknown> = {
    name: options.projectName ?? 'migrated-site',
    private: true,
    type: 'module',
    scripts: {
      dev: 'astro dev',
      // `astro check` first: type errors in generated pages should fail the
      // build, not surface later in a browser.
      build: 'astro check && astro build',
      preview: 'astro preview',
      // Split viewport production (skeleton): one build per device class, served by device.
      ...(split ? { 'build:desktop': 'VIEWPORT=desktop astro build --outDir dist/desktop', 'build:mobile': 'VIEWPORT=mobile astro build --outDir dist/mobile' } : {}),
    },
    dependencies: {
      astro: '^5.0.0',
      ...(tailwind ? { tailwindcss: '^4.0.0', '@tailwindcss/vite': '^4.0.0' } : {}),
    },
    devDependencies: {
      '@astrojs/check': '^0.9.0',
      typescript: '^5.7.0',
    },
  }
  files['package.json'] = stableJson(pkg)

  files['astro.config.mjs'] = [
    `import { defineConfig } from 'astro/config'`,
    ...(tailwind ? [`import tailwindcss from '@tailwindcss/vite'`] : []),
    ``,
    `export default defineConfig({`,
    // Canonical URLs and sitemaps hang off \`site\` — for a migration, SEO
    // continuity is the point, so the source site's URL always lands here.
    `  site: ${JSON.stringify(ir.site.url)},`,
    `  build: { format: 'directory' },`,
    ...(tailwind ? [`  vite: { plugins: [tailwindcss()] },`] : []),
    `})`,
    ``,
  ].join('\n')

  // Astro wants a tsconfig in every project — editors and the compiler read
  // it even in JS-only projects, and the emitted src/lib/fill.ts is TS.
  files['tsconfig.json'] = `${JSON.stringify({ extends: 'astro/tsconfigs/base', include: ['.astro/types.d.ts', '**/*'], exclude: ['dist'] }, null, 2)}\n`

  if (tailwind) files['src/styles/modern.css'] = modernCss(ir.tokens)

  files['src/lib/fill.ts'] = FILL_TS
  return files
}

/** Tailwind 4 evolution layer: CSS-first config with the site's extracted tokens. */
function modernCss(tokens: DesignTokens | undefined): string {
  const lines: string[] = [`@import 'tailwindcss';`, ``]
  const theme: string[] = []
  const push = (prefix: string, map: Record<string, string> | undefined) => {
    for (const [key, value] of Object.entries(map ?? {})) theme.push(`  --${prefix}-${key}: ${value};`)
  }
  push('color', tokens?.colors)
  push('font', tokens?.font_families)
  push('text', tokens?.font_sizes)
  push('spacing', tokens?.spacing)
  push('breakpoint', tokens?.breakpoints)
  if (theme.length) lines.push(`@theme {`, ...theme, `}`)
  return `${lines.join('\n')}\n`
}

const FILL_TS = `// Emitted by @contentrain/emitter-astro — the template runtime.
//
// Chrome, item templates and attribute values carry three marker forms:
//   @@mark@@                                       — a value, escaped
//   @@mark_html@@                                  — a value, raw HTML
//   <!--@@repeat:list@@-->…<!--@@/repeat@@-->      — once per list item
//   <!--@@if:name@@-->…<!--@@/if@@-->              — only when name has a value
// Rendering order is repeats → conditionals → marks, so a repeat body may hold
// conditionals and marks that only make sense per item.

/** Where page content splices into the body chrome — must match @contentrain/types CHROME_BODY_SLOT. */
export const BODY_SLOT = '<!--@@body@@-->'

const REPEAT_RE = /<!--@@repeat:([a-z0-9_]+)(?:\\|([\\s\\S]*?))?@@-->([\\s\\S]*?)<!--@@\\/repeat@@-->/gi
const IF_RE = /<!--@@if:(!?)([a-z0-9_]+)@@-->([\\s\\S]*?)<!--@@\\/if@@-->/gi
const MARK_RE = /@@([a-z0-9_]+)@@/gi

export type Values = Record<string, unknown>

export const esc = (value: unknown): string =>
  String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const isFilled = (value: unknown): boolean =>
  Array.isArray(value) ? value.length > 0 : value !== undefined && value !== null && value !== ''

/**
 * Replace @@marks@@. Values are escaped unless the mark name ends in _html —
 * escaping is the default so content-derived text can never break the page,
 * and the _html opt-in exists for themes that print a post's own markup
 * (full content in a list card, a link-bearing excerpt).
 */
export function fillMarks(html: string, values: Values): string {
  return html.replace(MARK_RE, (_all, key: string) => {
    const value = values[key]
    if (Array.isArray(value)) return value.map((v) => esc(v)).join(', ')
    return key.toLowerCase().endsWith('_html') ? String(value ?? '') : esc(value ?? '')
  })
}

/** Expand repeat blocks; each item renders the inner fragment with its own values. */
export function expandRepeats(html: string, values: Values): string {
  return html.replace(REPEAT_RE, (_all, name: string, sep: string | undefined, inner: string) => {
    const list = values[name]
    if (!Array.isArray(list) || list.length === 0) return ''
    return list
      .map((item, index) => {
        const itemValues: Values = { ...values, item, item_index: String(index) }
        if (item && typeof item === 'object') {
          for (const [k, v] of Object.entries(item as Record<string, unknown>)) itemValues['item_' + k] = v
        }
        return renderTemplate(inner, itemValues)
      })
      .join(sep ?? '')
  })
}

/** Drop conditional blocks whose value is empty (or present, when negated). */
export function applyConditions(html: string, values: Values): string {
  return html.replace(IF_RE, (_all, negate: string, name: string, inner: string) =>
    isFilled(values[name]) !== (negate === '!') ? inner : '',
  )
}

/** Full render: repeats → conditionals → marks. */
export function renderTemplate(html: string, values: Values): string {
  return fillMarks(applyConditions(expandRepeats(html, values), values), values)
}

/** Fill marks inside attribute values (per-page classes like postid-123). */
export function fillAttrs(attrs: Record<string, string> | undefined, values: Values): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [name, value] of Object.entries(attrs ?? {})) out[name] = fillMarks(value, values)
  return out
}

/**
 * Compose the body chrome with the page content. The split happens BEFORE any
 * rendering: the @@…@@ pattern would otherwise consume the @@body@@ inside the
 * marker comment, leaving <!----> behind and silently dropping the content
 * (measured cost on a real page: 49.8 vs 97.8).
 */
export function composeBody(chromeBody: string, values: Values, content: string): string {
  return chromeBody
    .split(BODY_SLOT)
    .map((part) => renderTemplate(part, values))
    .join(content)
}

/** Emitted stylesheets live under /styles/legacy/ — pages reference them by file name. */
export const cssHref = (file: string): string => '/styles/legacy/' + (file.split('/').pop() ?? file)

export interface MarkablePost {
  slug: string
  title: string
  body?: string
  dates?: string[]
  author?: string
  author_first?: string
  author_last?: string
  authors?: string[]
  terms?: string[]
  featured?: string[]
  excerpt?: string
  excerpt_html?: string
  marks?: Record<string, unknown>
}

/**
 * The mark vocabulary: title, author (+ first/last), date{n}, term{n}, feat{n},
 * excerpt, slug — plus \`terms\`/\`authors\` as LISTS for repeat blocks, the
 * _html variants for raw insertion, and any producer-supplied extras.
 */
export function postMarks(post: MarkablePost): Values {
  const values: Values = {
    title: post.title,
    author: post.author ?? '',
    author_first: post.author_first ?? '',
    author_last: post.author_last ?? '',
    excerpt: post.excerpt ?? '',
    excerpt_html: post.excerpt_html ?? post.excerpt ?? '',
    body_html: post.body ?? '',
    slug: post.slug,
    feat: post.featured?.[0] ?? '',
    terms: post.terms ?? [],
    authors: post.authors ?? (post.author ? [post.author] : []),
  }
  for (const [i, d] of (post.dates ?? []).entries()) values['date' + i] = d
  for (const [i, t] of (post.terms ?? []).entries()) values['term' + i] = t
  for (const [i, f] of (post.featured ?? []).entries()) values['feat' + i] = f
  return { ...values, ...(post.marks ?? {}) }
}
`

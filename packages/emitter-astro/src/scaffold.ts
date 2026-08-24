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
      build: 'astro build',
      preview: 'astro preview',
      // Split viewport production (skeleton): one build per device class, served by device.
      ...(split ? { 'build:desktop': 'VIEWPORT=desktop astro build --outDir dist/desktop', 'build:mobile': 'VIEWPORT=mobile astro build --outDir dist/mobile' } : {}),
    },
    dependencies: {
      astro: '^5.0.0',
      ...(tailwind ? { tailwindcss: '^4.0.0', '@tailwindcss/vite': '^4.0.0' } : {}),
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

const FILL_TS = `// Emitted by @contentrain/emitter-astro — shared mark-filling helpers.
// Chrome and item templates carry @@mark@@ placeholders; pages fill them from content.

/** Where page content splices into the body chrome — must match @contentrain/types CHROME_BODY_SLOT. */
export const BODY_SLOT = '<!--@@body@@-->'

export const esc = (value: unknown): string =>
  String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function fillMarks(html: string, marks: Record<string, unknown>): string {
  return html.replace(/@@([a-z0-9_]+)@@/gi, (_all, key: string) => esc(marks[key] ?? ''))
}

export interface MarkablePost {
  slug: string
  title: string
  dates?: string[]
  author?: string
  author_first?: string
  author_last?: string
  terms?: string[]
  featured?: string[]
  excerpt?: string
}

/** The mark vocabulary the measurement chain proved out: title, author (+ first/last), date{n}, term{n}, feat{n}, excerpt, slug. */
export function postMarks(post: MarkablePost): Record<string, string> {
  const marks: Record<string, string> = {
    title: post.title,
    author: post.author ?? '',
    author_first: post.author_first ?? '',
    author_last: post.author_last ?? '',
    excerpt: post.excerpt ?? '',
    slug: post.slug,
    feat: post.featured?.[0] ?? '',
  }
  for (const [i, d] of (post.dates ?? []).entries()) marks[\`date\${i}\`] = d
  for (const [i, t] of (post.terms ?? []).entries()) marks[\`term\${i}\`] = t
  for (const [i, f] of (post.featured ?? []).entries()) marks[\`feat\${i}\`] = f
  return marks
}
`

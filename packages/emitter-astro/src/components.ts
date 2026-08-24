// Component placeholders.
//
// The emitter cannot invent a comments form or an ad slot — it marks the
// spot. `rest`-sourced components are candidates for real implementations
// against content data; `runtime` components need a live provider (that
// conversation belongs to MigrationHandoff offers); `chrome` components
// already travel inside the family chrome and get a stub for refactoring
// toward.

import type { ComponentDef } from '@contentrain/types'
import { pascalCase } from './util.js'

export function componentFiles(components: ComponentDef[]): Record<string, string> {
  const files: Record<string, string> = {}
  for (const c of components) {
    const variants = (c.variants ?? []).map((v) => v.key)
    files[`src/components/${pascalCase(c.id)}.astro`] = `---
/**
 * cr-component: type=${c.type} source=${c.source}${c.name ? ` — ${c.name}` : ''}
 * Emitted by @contentrain/emitter-astro as a placeholder.${
   c.source === 'runtime' ? '\n * Needs a live provider — see the migration handoff offers.' : ''
 }${variants.length ? `\n * Variants: ${variants.join(', ')}` : ''}
 */
const { variant = ${JSON.stringify(variants[0] ?? 'default')} } = Astro.props
---
<cr-component data-type=${JSON.stringify(c.type)} data-variant={variant}></cr-component>
`
  }
  return files
}

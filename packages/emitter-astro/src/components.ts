// Components.
//
// `runtime`-sourced comments and forms get REAL implementations: an Astro
// component that mounts a custom element carrying the runtime binding and the
// page's entry address, and a client script that fetches, renders and submits
// against the provider's public API (src/lib/embed.ts). Everything else — and
// every runtime component when no binding was given — is a `<cr-component>`
// placeholder that marks the spot: the emitter cannot invent an ad slot, and a
// comments form without a provider is a promise the page cannot keep.
//
// A component is mounted where the chrome carries its marker
// (`<!--@@component:ID@@-->`, see layouts.ts); emitting the file alone would
// leave it unused, which is not integration.

import type { ComponentDef, RuntimeBinding } from '@contentrain/types'
import { EMBED_TS } from './embed.js'
import { pascalCase, stableJson } from './util.js'

export interface ComponentGenResult {
  files: Record<string, string>
  warnings: string[]
}

/** Component types this emitter implements against a runtime binding. */
export const RUNTIME_IMPLEMENTED = new Set<ComponentDef['type']>(['comments', 'form'])

export function isRuntimeImplemented(c: ComponentDef, runtime: RuntimeBinding | undefined): boolean {
  if (!runtime || c.source !== 'runtime' || !RUNTIME_IMPLEMENTED.has(c.type)) return false
  return c.type !== 'form' || Boolean(c.model)
}

export function componentFiles(components: ComponentDef[], runtime: RuntimeBinding | undefined): ComponentGenResult {
  const files: Record<string, string> = {}
  const warnings: string[] = []
  let needsRuntime = false

  for (const c of components) {
    const name = pascalCase(c.id)
    if (isRuntimeImplemented(c, runtime)) {
      needsRuntime = true
      files[`src/components/${name}.astro`] = c.type === 'comments' ? commentsSource(c) : formSource(c)
      continue
    }
    if (c.source === 'runtime' && RUNTIME_IMPLEMENTED.has(c.type)) {
      warnings.push(
        !runtime
          ? `component ${c.id} (${c.type}): no runtime binding given — emitted as a placeholder; pass input.runtime to mount it`
          : `component ${c.id} (form): no model named — a form must say which collection it submits to; emitted as a placeholder`,
      )
    }
    files[`src/components/${name}.astro`] = placeholderSource(c)
  }

  if (needsRuntime && runtime) {
    files['src/data/runtime.json'] = stableJson({ base_url: runtime.base_url, project_id: runtime.project_id })
    files['src/lib/embed.ts'] = EMBED_TS
  }
  return { files, warnings }
}

function header(c: ComponentDef, extra = ''): string {
  return `/**
 * cr-component: type=${c.type} source=${c.source}${c.name ? ` — ${c.name}` : ''}
 * Emitted by @contentrain/emitter-astro.${extra}
 */`
}

function placeholderSource(c: ComponentDef): string {
  const variants = (c.variants ?? []).map((v) => v.key)
  return `---
${header(
  c,
  `${c.source === 'runtime' ? '\n * Placeholder — needs a live provider; see the migration handoff offers.' : ' Placeholder.'}${
    variants.length ? `\n * Variants: ${variants.join(', ')}` : ''
  }`,
)}
interface Props {
  variant?: string
  /** Content-store address of the page's entry; unused by a placeholder. */
  entry?: { model_id: string; entry_id: string; locale?: string }
}
const { variant = ${JSON.stringify(variants[0] ?? 'default')} } = Astro.props
---
<cr-component data-type=${JSON.stringify(c.type)} data-variant={variant}></cr-component>
`
}

function commentsSource(c: ComponentDef): string {
  return `---
${header(c, `
 * Mounted comments thread: reads the entry's approved comments from the runtime
 * provider's public API and posts new ones. Pending comments are never shown —
 * moderation happens on the provider. Renders nothing on a page without an
 * entry address (a list, a static page).`)}
import runtime from '../data/runtime.json'

interface Props {
  /** Content-store address of the page's entry — the thread's key. */
  entry?: { model_id: string; entry_id: string; locale?: string }
  variant?: string
}
const { entry, variant = 'default' } = Astro.props
---
{entry && (
  <cr-comments
    class={\`cr-comments cr-comments--\${variant}\`}
    data-base-url={runtime.base_url}
    data-project={runtime.project_id}
    data-model={entry.model_id}
    data-entry={entry.entry_id}
    data-locale={entry.locale}
    data-variant={variant}
  >
    <noscript><p class="cr-noscript">Comments need JavaScript.</p></noscript>
  </cr-comments>
)}

<script>
  import { mountComments } from '../lib/embed'

  class CrComments extends HTMLElement {
    connectedCallback() {
      void mountComments(this)
    }
  }
  if (!customElements.get('cr-comments')) customElements.define('cr-comments', CrComments)
</script>
`
}

function formSource(c: ComponentDef): string {
  return `---
${header(c, `
 * Mounted public form for the ${JSON.stringify(c.model)} model: fetches the
 * exposed fields from the runtime provider, renders one control per field
 * (honeypot and captcha included when the model asks for them) and submits.
 * Submissions land on the provider for moderation; an approved one becomes a
 * content entry there.`)}
import runtime from '../data/runtime.json'

interface Props {
  variant?: string
  /** Accepted for uniform mounting; a form is addressed by its model, not by the page's entry. */
  entry?: { model_id: string; entry_id: string; locale?: string }
}
const { variant = 'default' } = Astro.props
---
<cr-form
  class={\`cr-form-mount cr-form-mount--\${variant}\`}
  data-base-url={runtime.base_url}
  data-project={runtime.project_id}
  data-model=${JSON.stringify(c.model)}
  data-variant={variant}
>
  <noscript><p class="cr-noscript">This form needs JavaScript.</p></noscript>
</cr-form>

<script>
  import { mountForm } from '../lib/embed'

  class CrForm extends HTMLElement {
    connectedCallback() {
      void mountForm(this)
    }
  }
  if (!customElements.get('cr-form')) customElements.define('cr-form', CrForm)
</script>
`
}

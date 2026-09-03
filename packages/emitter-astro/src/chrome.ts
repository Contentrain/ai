// Header and footer chrome → shared Astro components.
//
// The body chrome stays one fragment because the content container is nested
// deep inside it. The masthead and the colophon are the exception: they sit
// outside the content path and repeat across families, so lifting them out
// gives the project one address for the nav (where a jQuery-free menu replaces
// the theme's) and one copy of the markup instead of N.
//
// Identity is by CONTENT, not by declared name: two families whose headers are
// byte-identical share a component even if the producer named them differently,
// and two different headers that claim the same name get separate files plus a
// warning — never a silent swap, which would put one family's nav on another's
// pages.

import type { LayoutFamily } from '@contentrain/types'
import { CHROME_BODY_SLOT } from '@contentrain/types'
import { balanceWarning } from './balance.js'
import { pascalCase, stableJson } from './util.js'

export type ChromePosition = 'header' | 'footer'

export interface ChromeComponentRef {
  name: string
  position: ChromePosition
}

export interface ChromeRegistry {
  files: Record<string, string>
  /** Family id → the components its layout renders, in chunk order. */
  byFamily: Map<string, ChromeComponentRef[]>
  warnings: string[]
}

const DEFAULT_NAME: Record<ChromePosition, string> = {
  header: 'SiteHeader',
  footer: 'SiteFooter',
}

/** A component name Astro can import: PascalCase and starting with a letter. */
function componentName(raw: string): string {
  const pascal = pascalCase(raw)
  return /^[A-Za-z]/.test(pascal) ? pascal : `Chrome${pascal}`
}

function componentSource(name: string): string {
  return `---
/**
 * Chrome component: ${name} — emitted by @contentrain/emitter-astro.
 * Markup travels as data so the Astro compiler never parses theme markup, and
 * fills the same \`@@mark@@\` placeholders the rest of the chrome does.
 */
import chunk from '../data/components/${name}.json'
import { renderTemplate } from '../lib/fill'

interface Props {
  /** Page marks — the region's own placeholders (site name, current-page class). */
  marks?: Record<string, unknown>
}
const { marks = {} } = Astro.props
---
<Fragment set:html={renderTemplate(chunk.html, marks)} />
`
}

export function chromeComponents(families: LayoutFamily[]): ChromeRegistry {
  const files: Record<string, string> = {}
  const byFamily = new Map<string, ChromeComponentRef[]>()
  const warnings: string[] = []
  /** html → emitted component name, so identical regions collapse into one. */
  const byHtml = new Map<string, string>()
  /** emitted name → its html, so a name clash can be detected and renamed. */
  const byName = new Map<string, string>()

  for (const family of families) {
    const refs: ChromeComponentRef[] = []
    for (const chunk of family.chrome ?? []) {
      if (chunk.position !== 'header' && chunk.position !== 'footer') continue
      const position: ChromePosition = chunk.position
      const where = `family ${family.id}: ${position} chrome`

      if (chunk.html.includes(CHROME_BODY_SLOT)) {
        warnings.push(
          `${where} carries ${CHROME_BODY_SLOT} — content goes in the body chunk; the marker is rendered as a comment`,
        )
      }
      const unbalanced = balanceWarning(chunk.html)
      if (unbalanced) {
        warnings.push(
          `${where} is not balanced (${unbalanced}) — a lifted region must close what it opens; keep it in the body chunk`,
        )
      }

      const wanted = componentName(chunk.component ?? DEFAULT_NAME[position])
      let name = byHtml.get(chunk.html)
      if (name === undefined) {
        name = wanted
        for (let n = 2; byName.has(name) && byName.get(name) !== chunk.html; n++) {
          name = `${wanted}${n}`
        }
        if (name !== wanted) {
          warnings.push(
            `${where}: component name "${wanted}" is already used by different markup — emitted as "${name}"`,
          )
        }
        byHtml.set(chunk.html, name)
        byName.set(name, chunk.html)
        files[`src/data/components/${name}.json`] = stableJson({ html: chunk.html })
        files[`src/components/${name}.astro`] = componentSource(name)
      }
      refs.push({ name, position })
    }
    if (refs.length) byFamily.set(family.id, refs)
  }

  return { files, byFamily, warnings }
}

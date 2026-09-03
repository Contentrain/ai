// Layout families → Astro layouts.
//
// Chrome travels as DATA, not as Astro template source: the compiler must
// never parse browser-tolerated theme markup. And the body chrome is injected
// as ONE fragment: real themes nest the content container deep inside the
// chrome, so splitting it into before/after halves produces unbalanced
// fragments that the parser silently "repairs" (measured cost: 36 vs 100).
// Content splices in at CHROME_BODY_SLOT before the single injection.
//
// Root attributes travel with the chrome for the same reason: themes key their
// container rules off `<body class="wp-singular single …">` and `<html class="js
// wf-…">`, so a page with perfect content and empty root attributes loses its
// whole layout (measured: 36.4 vs 100).

import type { LayoutFamily } from '@contentrain/types'
import { CHROME_BODY_SLOT } from '@contentrain/types'
import type { ChromeComponentRef } from './chrome.js'
import { balanceWarning } from './balance.js'
import { pascalCase, stableJson } from './util.js'

export interface FamilyGenResult {
  files: Record<string, string>
  warnings: string[]
}

export function familyFiles(
  family: LayoutFamily,
  lang: string,
  components: ChromeComponentRef[] = [],
): FamilyGenResult {
  const name = pascalCase(family.id)
  // Header/footer regions are emitted as shared components (see chrome.ts) and
  // rendered as siblings of the body fragment; the layout injects the rest.
  const chunks = (family.chrome ?? []).filter((c) => c.position !== 'header' && c.position !== 'footer')
  const warnings: string[] = []
  const joined = (position: string) =>
    chunks.filter((c) => c.position === position).map((c) => c.html).join('\n')

  const bodyChunks = chunks.filter((c) => c.position === 'body')
  let body: string
  if (bodyChunks.length) {
    body = bodyChunks.map((c) => c.html).join('\n')
    if (!body.includes(CHROME_BODY_SLOT)) {
      warnings.push(`family ${family.id}: body chrome has no ${CHROME_BODY_SLOT} marker — content appended at the end`)
      body += CHROME_BODY_SLOT
    }
  } else {
    // Legacy pair: compose into one string with the slot between the halves.
    body = `${joined('before_body')}${CHROME_BODY_SLOT}${joined('after_body')}`
  }
  const unbalanced = balanceWarning(body)
  if (unbalanced) {
    warnings.push(`family ${family.id}: body chrome is not balanced (${unbalanced}) — the browser will repair it and the page loses its layout`)
  }

  const files: Record<string, string> = {}
  files[`src/data/chrome/${family.id}.json`] = stableJson({
    head: joined('head'),
    body,
    html_attrs: family.root_attrs?.html ?? {},
    body_attrs: family.root_attrs?.body ?? {},
  })

  const cssLinks = (family.css.files ?? [])
    .map((f) => `<link rel="stylesheet" href="/styles/legacy/${f.split('/').pop()}" />`)
    .join('\n')

  const imported = [...new Set(components.map((c) => c.name))]
  const componentImports = imported
    .map((n) => `import ${n} from '../components/${n}.astro'`)
    .join('\n')
  const renderRefs = (position: 'header' | 'footer') =>
    components
      .filter((c) => c.position === position)
      .map((c) => `    <${c.name} marks={marks} />`)
      .join('\n')

  files[`src/layouts/${name}.astro`] = `---
// Family: ${family.id}${family.name ? ` (${family.name})` : ''} — emitted by @contentrain/emitter-astro
import chrome from '../data/chrome/${family.id}.json'
import { cssHref, fillAttrs, renderTemplate, composeBody } from '../lib/fill'
${componentImports ? `${componentImports}\n` : ''}
interface Props {
  title?: string
  marks?: Record<string, unknown>
  /** Page content as an HTML string; slot children are used when absent. */
  body?: string
  /** Stylesheets only this page loads (page-builder sites emit CSS per page). */
  css?: string[]
  /** Document language — a multilingual site's routes each pass their own. */
  lang?: string
}
const { title = '', marks = {}, body, css = [], lang = ${JSON.stringify(lang)} } = Astro.props
const head = renderTemplate(chrome.head, marks)
// Root attributes carry the theme's layout hooks; values may hold @@marks@@.
// An explicit lang from the source wins over the project default.
const htmlAttrs = { lang, ...fillAttrs(chrome.html_attrs, marks) }
const bodyAttrs = fillAttrs(chrome.body_attrs, marks)
const content = body ?? (Astro.slots.has('default') ? await Astro.slots.render('default') : '')
// Split at the marker FIRST, then fill marks per side — filling first would
// eat the @@body@@ inside the marker and silently drop the content.
const html = composeBody(chrome.body, marks, content)
---
<!doctype html>
<html {...htmlAttrs}>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
${cssLinks
  .split('\n')
  .filter(Boolean)
  .map((l) => `    ${l}`)
  .join('\n')}
    {css.map((file) => (
      <link rel="stylesheet" href={cssHref(file)} />
    ))}
    <Fragment set:html={head} />
    <title>{title}</title>
  </head>
  <body {...bodyAttrs}>
${renderRefs('header') ? `${renderRefs('header')}\n` : ''}    <Fragment set:html={html} />
${renderRefs('footer') ? `${renderRefs('footer')}\n` : ''}  </body>
</html>
`
  return { files, warnings }
}

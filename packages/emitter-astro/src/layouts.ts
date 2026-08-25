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
import { pascalCase, stableJson } from './util.js'

export interface FamilyGenResult {
  files: Record<string, string>
  warnings: string[]
}

export function familyFiles(family: LayoutFamily, lang: string): FamilyGenResult {
  const name = pascalCase(family.id)
  const chunks = family.chrome ?? []
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

  files[`src/layouts/${name}.astro`] = `---
// Family: ${family.id}${family.name ? ` (${family.name})` : ''} — emitted by @contentrain/emitter-astro
import chrome from '../data/chrome/${family.id}.json'
import { fillAttrs, fillMarks, composeBody } from '../lib/fill'

interface Props {
  title?: string
  marks?: Record<string, string>
  /** Page content as an HTML string; slot children are used when absent. */
  body?: string
}
const { title = '', marks = {}, body } = Astro.props
const head = fillMarks(chrome.head, marks)
// Root attributes carry the theme's layout hooks; values may hold @@marks@@.
// An explicit lang from the source wins over the project default.
const htmlAttrs = { lang: ${JSON.stringify(lang)}, ...fillAttrs(chrome.html_attrs, marks) }
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
    <Fragment set:html={head} />
    <title>{title}</title>
  </head>
  <body {...bodyAttrs}>
    <Fragment set:html={html} />
  </body>
</html>
`
  return { files, warnings }
}

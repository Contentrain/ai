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

import type { ComponentDef, LayoutFamily } from '@contentrain/types'
import { CHROME_BODY_SLOT, CHROME_COMPONENT_CLOSE, CHROME_COMPONENT_OPEN } from '@contentrain/types'
import type { ChromeComponentRef } from './chrome.js'
import { balanceWarning } from './balance.js'
import { stripSeoTags } from './seo.js'
import { pascalCase, stableJson } from './util.js'

export interface FamilyGenResult {
  files: Record<string, string>
  warnings: string[]
}

/** A component the family's chrome mounts at a `<!--@@component:ID@@-->` marker. */
export interface MountRef {
  id: string
  name: string
  variant: string
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const MARKER_RE = new RegExp(`${escapeRe(CHROME_COMPONENT_OPEN)}([^@\\s]+)${escapeRe(CHROME_COMPONENT_CLOSE)}`, 'g')

/** Component ids the chrome names, in order of first appearance. */
export function componentMarkers(html: string): string[] {
  return [...new Set([...html.matchAll(MARKER_RE)].map((m) => m[1] ?? ''))]
}

export interface FamilyOptions {
  /** Emit `<Seo>` and take the template page's SEO tags out of the head chrome. */
  seo?: boolean
  /** `og:site_name`, from `ProjectIR.site.title`. */
  siteName?: string
}

export function familyFiles(
  family: LayoutFamily,
  lang: string,
  components: ChromeComponentRef[] = [],
  definitions: Map<string, ComponentDef> = new Map(),
  /** Component ids found in the CONTENT bodies rendered through this family (a form inside a page's post_content). */
  bodyMarkers: Iterable<string> = [],
  options: FamilyOptions = {},
): FamilyGenResult {
  const name = pascalCase(family.id)
  // Header/footer regions are emitted as shared components (see chrome.ts) and
  // rendered as siblings of the body fragment; the layout injects the rest.
  const chunks = (family.chrome ?? []).filter((c) => c.position !== 'header' && c.position !== 'footer')
  const warnings: string[] = []
  for (const chunk of family.chrome ?? []) {
    if ((chunk.position === 'header' || chunk.position === 'footer') && componentMarkers(chunk.html).length) {
      warnings.push(`family ${family.id}: ${chunk.position} chrome carries a component marker — components mount in body chrome only; the marker renders as a comment`)
    }
  }
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

  // Component mount points. A marker names a ComponentDef; the layout imports
  // that component and renders it there. A marker nobody defined is dropped
  // with a warning rather than left as a mystery comment in every page.
  // Markers live in the chrome (the theme's comments region) or in the content
  // body itself (a contact form inside a page's post_content); the layout splits
  // the COMPOSED html, so both mount the same way. The mount table just has to
  // know every id that can appear.
  const placements = new Map((family.components ?? []).map((p) => [p.component, p]))
  const mounts: MountRef[] = []
  const mount = (id: string, def: ComponentDef) => {
    if (mounts.some((m) => m.id === id)) return
    const variant = placements.get(id)?.variant ?? def.variants?.[0]?.key ?? 'default'
    mounts.push({ id, name: pascalCase(id), variant })
  }
  for (const id of componentMarkers(body)) {
    const def = definitions.get(id)
    if (!def) {
      warnings.push(`family ${family.id}: component marker "${id}" has no component definition — marker dropped`)
      body = body.split(`${CHROME_COMPONENT_OPEN}${id}${CHROME_COMPONENT_CLOSE}`).join('')
      continue
    }
    mount(id, def)
  }
  for (const id of new Set(bodyMarkers)) {
    const def = definitions.get(id)
    if (!def) {
      warnings.push(`family ${family.id}: content bodies carry component marker "${id}" with no component definition — rendered as a comment`)
      continue
    }
    mount(id, def)
  }
  for (const placement of family.components ?? []) {
    if (!mounts.some((m) => m.id === placement.component)) {
      warnings.push(`family ${family.id}: component placement "${placement.component}" has no marker in the body chrome or in any content body — not mounted`)
    }
  }

  // The template page's title, description, canonical, og/twitter tags and
  // per-page JSON-LD come out of the head: the emitter renders those per page
  // from the entry, and two of each is worse than none.
  const seoOn = options.seo !== false
  let head = joined('head')
  if (seoOn) {
    const stripped = stripSeoTags(head)
    head = stripped.html
    if (stripped.removed.length) {
      warnings.push(`family ${family.id}: removed the template page's ${stripped.removed.join(', ')} from head chrome — the emitter renders these per page`)
    }
  }

  const files: Record<string, string> = {}
  files[`src/data/chrome/${family.id}.json`] = stableJson({
    head,
    body,
    html_attrs: family.root_attrs?.html ?? {},
    body_attrs: family.root_attrs?.body ?? {},
  })

  const cssLinks = (family.css.files ?? [])
    .map((f) => `<link rel="stylesheet" href="/styles/legacy/${f.split('/').pop()}" />`)
    .join('\n')

  const siteNameProp = options.siteName ? ` siteName={${JSON.stringify(options.siteName)}}` : ''
  const imported = [...new Set([...components.map((c) => c.name), ...mounts.map((m) => m.name)])]
  const componentImports = [
    ...(seoOn ? [`import Seo from '../components/Seo.astro'`] : []),
    ...imported.map((n) => `import ${n} from '../components/${n}.astro'`),
  ].join('\n')
  const mountType = [...new Set(mounts.map((m) => `typeof ${m.name}`))].join(' | ')
  const mountTable = mounts.length
    ? `// Components the chrome mounts at <!--@@component:ID@@--> markers; the page's
// entry address travels to each so a comments thread knows which entry it is.
const mounts: Record<string, { Mount: ${mountType}; variant: string } | undefined> = {
${mounts.map((m) => `  ${JSON.stringify(m.id)}: { Mount: ${m.name}, variant: ${JSON.stringify(m.variant)} },`).join('\n')}
}
const parts = splitComponents(html).map((part) => ({
  html: part.html,
  Mount: part.component ? mounts[part.component]?.Mount : undefined,
  variant: part.component ? (mounts[part.component]?.variant ?? 'default') : 'default',
}))
`
    : ''
  const bodyRender = mounts.length
    ? `    {parts.map(({ html: part, Mount, variant }) => (Mount ? <Mount entry={entry} variant={variant} /> : <Fragment set:html={part} />))}`
    : `    <Fragment set:html={html} />`
  const renderRefs = (position: 'header' | 'footer') =>
    components
      .filter((c) => c.position === position)
      .map((c) => `    <${c.name} marks={marks} />`)
      .join('\n')

  files[`src/layouts/${name}.astro`] = `---
// Family: ${family.id}${family.name ? ` (${family.name})` : ''} — emitted by @contentrain/emitter-astro
import chrome from '../data/chrome/${family.id}.json'
import { cssHref, fillAttrs, renderTemplate, composeBody${mounts.length ? ', splitComponents' : ''}${seoOn ? ', type SeoInput' : ''} } from '../lib/fill'
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
  /** Content-store address of the page's entry — mounted components (comments) key on it. */
  entry?: { model_id: string; entry_id: string; locale?: string }${seoOn ? `
  /** Per-page SEO — see src/components/Seo.astro. */
  seo?: SeoInput` : ''}
}
const { title = '', marks = {}, body, css = [], lang = ${JSON.stringify(lang)}${mounts.length ? ', entry' : ''}${seoOn ? ', seo' : ''} } = Astro.props
const head = renderTemplate(chrome.head, marks)
// Root attributes carry the theme's layout hooks; values may hold @@marks@@.
// An explicit lang from the source wins over the project default.
const htmlAttrs = { lang, ...fillAttrs(chrome.html_attrs, marks) }
const bodyAttrs = fillAttrs(chrome.body_attrs, marks)
const content = body ?? (Astro.slots.has('default') ? await Astro.slots.render('default') : '')
// Split at the marker FIRST, then fill marks per side — filling first would
// eat the @@body@@ inside the marker and silently drop the content.
const html = composeBody(chrome.body, marks, content)
${mountTable}---
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
${seoOn
  ? `    <Seo title={title} locale={lang}${siteNameProp} {...(seo ?? {})} />`
  : `    <title>{title}</title>`}
  </head>
  <body {...bodyAttrs}>
${renderRefs('header') ? `${renderRefs('header')}\n` : ''}${bodyRender}
${renderRefs('footer') ? `${renderRefs('footer')}\n` : ''}  </body>
</html>
`
  return { files, warnings }
}

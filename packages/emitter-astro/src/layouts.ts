// Layout families → Astro layouts.
//
// Chrome travels as DATA, not as Astro template source: the compiler must
// never parse browser-tolerated theme markup (that distinction alone took a
// measured corpus from build failures to zero). Each family's chrome chunks
// land in a JSON data file; the layout injects them with `set:html` and fills
// `@@mark@@` placeholders from the page's props.

import type { LayoutFamily } from '@contentrain/types'
import { pascalCase, stableJson } from './util.js'

export function familyFiles(family: LayoutFamily, lang: string): Record<string, string> {
  const name = pascalCase(family.id)
  const chunks = family.chrome ?? []
  const joined = (position: 'head' | 'before_body' | 'after_body') =>
    chunks.filter((c) => c.position === position).map((c) => c.html).join('\n')

  const files: Record<string, string> = {}
  files[`src/data/chrome/${family.id}.json`] = stableJson({
    head: joined('head'),
    before: joined('before_body'),
    after: joined('after_body'),
  })

  const cssLinks = (family.css.files ?? [])
    .map((f) => `<link rel="stylesheet" href="/styles/legacy/${f.split('/').pop()}" />`)
    .join('\n')

  files[`src/layouts/${name}.astro`] = `---
// Family: ${family.id}${family.name ? ` (${family.name})` : ''} — emitted by @contentrain/emitter-astro
import chrome from '../data/chrome/${family.id}.json'
import { fillMarks } from '../lib/fill'

interface Props {
  title?: string
  marks?: Record<string, string>
}
const { title = '', marks = {} } = Astro.props
const head = fillMarks(chrome.head, marks)
const before = fillMarks(chrome.before, marks)
const after = fillMarks(chrome.after, marks)
---
<!doctype html>
<html lang=${JSON.stringify(lang)}>
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
  <body>
    <Fragment set:html={before} />
    <slot />
    <Fragment set:html={after} />
  </body>
</html>
`
  return files
}

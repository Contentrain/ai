#!/usr/bin/env node
// catalog.json from components/<id>/meta.json. The meta is the source; the
// catalog adds each component's file list and the kit-wide requirements.
// `--check` fails when catalog.json is stale instead of writing it.

import { readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const componentsDir = join(root, 'components')
const NOT_SHIPPED = new Set(['meta.json', 'fixtures.json'])

/** Tokens every kit component may read — the starter's @theme roles. */
const TOKENS = [
  '--color-surface', '--color-surface-muted', '--color-ink', '--color-ink-muted', '--color-line', '--color-accent', '--color-accent-ink',
  '--font-sans', '--container-prose', '--container-page', '--container-wide', '--radius-card',
  // Optional: read with a fallback to the kit's own value, so they change nothing until a site sets them.
  '--font-weight-heading', '--font-weight-body', '--text-body', '--leading-body', '--leading-heading', '--radius-control', '--radius-image', '--spacing-gutter',
  // Optional, applied by the site's theme on the kit's markers: data-kit-text, data-kit-section, data-cr-part="nav-header", headings in main.
  '--text-nav', '--text-heading-1', '--text-heading-2', '--text-heading-3', '--spacing-section',
]

const ids = (await readdir(componentsDir, { withFileTypes: true }))
  .filter(entry => entry.isDirectory() && !entry.name.startsWith('_'))
  .map(entry => entry.name)
  .toSorted()

// A section's content props → the page-singleton fields that hold them (DECISIONS §7b): the prop path with
// each name in snake_case. Same rule as `contentFieldName` in src/catalog.ts, which validateCatalog checks.
function contentFields(props, prop = '', field = '') {
  const out = {}
  for (const [name, def] of Object.entries(props)) {
    if (def.content === false) continue
    const p = prop + name
    const f = field + name.replace(/[A-Z]/g, c => `_${c.toLowerCase()}`)
    out[p] = f
    Object.assign(out, contentFields(def.fields ?? {}, `${p}.`, `${f}.`))
    if (typeof def.items === 'object') Object.assign(out, contentFields(def.items.fields ?? {}, `${p}[].`, `${f}[].`))
  }
  return out
}

const components = await Promise.all(ids.map(async (id) => {
  const meta = JSON.parse(await readFile(join(componentsDir, id, 'meta.json'), 'utf8'))
  if (meta.id !== id) throw new Error(`components/${id}/meta.json says id "${meta.id}"`)
  const files = (await readdir(join(componentsDir, id))).filter(name => !NOT_SHIPPED.has(name)).toSorted()
  meta.files = files
  if (meta.category === 'section') meta.contentFields = contentFields(meta.props)
  return meta
}))

const catalog = {
  format: 'astro-kit-catalog@1',
  tokens: TOKENS,
  dependencies: { 'tailwind-merge': '^3.7.0', 'tailwind-variants': '^3.3.1' },
  components,
}
const text = `${JSON.stringify(catalog, null, 2)}\n`
const target = join(root, 'catalog.json')

if (process.argv.includes('--check')) {
  const current = await readFile(target, 'utf8').catch(() => '')
  if (current !== text) {
    console.error('catalog.json is stale — run `pnpm --filter @contentrain/astro-kit catalog`.')
    process.exit(1)
  }
} else {
  await writeFile(target, text)
  console.log(`catalog.json: ${components.length} components`)
}

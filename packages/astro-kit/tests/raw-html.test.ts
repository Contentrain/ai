import { readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(import.meta.dirname, '..', '..', '..')

async function astroFiles(dir: string): Promise<string[]> {
  return (await Promise.all((await readdir(dir, { withFileTypes: true })).map(entry =>
    entry.isDirectory() ? astroFiles(join(dir, entry.name)) : Promise.resolve(entry.name.endsWith('.astro') ? [join(dir, entry.name)] : []),
  ))).flat()
}

/**
 * Plain-text fields (title, excerpt, alt, caption, a term's name and description) are text: wp-import decodes their
 * character references, so `&lt;script&gt;` in one is `<script>` — safe only because Astro escapes it where it is
 * printed. Raw HTML goes out through these sinks alone, each fed markup the site already holds (a rich-text body
 * rendered from markdown or HTML) or a JSON-LD block with `<` escaped. A new `set:html` fails here until it is shown
 * not to print a text field.
 */
const SINKS = [
  'packages/astro-kit/components/breadcrumb/Breadcrumb.astro: jsonLd', // JSON.stringify(...).replace(/</g, '\\u003c')
  'packages/astro-kit/components/dialog/Dialog.astro: noscript', // a <style> built from the dialog's id, a checked token; no field
  'packages/astro-kit/components/faq/Faq.astro: item.answer', // rich text
  'packages/astro-kit/components/faq/Faq.astro: structured', // JSON-LD, `<` escaped
  'packages/astro-kit/components/pricing/Pricing.astro: features[i]', // renderMarkdown(plan.features)
  'packages/astro-kit/components/prose/Prose.astro: body', // rich text
  'packages/astro-kit/components/split/Split.astro: html', // renderMarkdown(body)
  'packages/astro-kit/components/tabs/Tabs.astro: item.content', // rich text
  'templates/astro-starter/src/components/SEO.astro: serializeLd(jsonLd)', // JSON-LD, `<` escaped
  'templates/astro-starter/src/components/studio/FormMount.astro: fieldsHtml(fields)', // lib/studio/form-fields.ts: esc()'d labels and controls
  'templates/astro-starter/src/components/studio/StaticForm.astro: html', // built from esc()'d labels and controls
  'templates/astro-starter/src/components/studio/StudioForm.astro: fieldsHtml(fields)', // lib/studio/form-fields.ts: esc()'d labels and controls
]

describe('raw HTML in the kit and the starter', () => {
  it('goes out only through the known sinks, never a plain-text field', async () => {
    // The starter's components/kit are exact copies of components/ (catalog.test.ts), so they are read once.
    const files = [
      ...await astroFiles(join(ROOT, 'packages', 'astro-kit', 'components')),
      ...(await astroFiles(join(ROOT, 'templates', 'astro-starter', 'src'))).filter(file => !file.includes(join('components', 'kit'))),
    ]
    const found: string[] = []
    for (const file of files) {
      const source = await readFile(file, 'utf8')
      for (const match of source.matchAll(/set:html=\{([^}]*(?:\([^)]*\))?)\}/g)) found.push(`${relative(ROOT, file)}: ${match[1]}`)
      expect(source, file).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML/)
    }
    expect(found.toSorted()).toEqual(SINKS.toSorted())
  })
})

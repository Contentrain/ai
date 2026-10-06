import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

// The starter's form markup reaches the page through set:html (raw-html.test.ts lists the sinks), and its labels and
// options come from the source site: every value must arrive escaped, or a WordPress form label is stored XSS on the
// new site. The starter is a project of its own (its tsconfig extends astro), so the two modules are compiled here.
const studio = join(import.meta.dirname, '..', '..', '..', 'templates', 'astro-starter', 'src', 'lib', 'studio')
const compile = async (file: string) => ts.transpileModule(await readFile(join(studio, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
// `'` is left as is by encodeURIComponent, and the address sits in a quoted import.
const embed = `data:text/javascript,${encodeURIComponent(await compile('embed.ts')).replace(/'/g, '%27')}`
const formFields = (await compile('form-fields.ts')).replace(`from './embed'`, `from '${embed}'`)
interface FieldDef { type: string, required?: boolean, label?: string, options?: string[], min?: number, max?: number, pattern?: string }
const { fieldsHtml } = await import(`data:text/javascript,${encodeURIComponent(formFields)}`) as { fieldsHtml: (fields: Array<{ id: string, def: FieldDef }>, prefix?: string) => string }

const SCRIPT = '<script>alert(1)</script>'
const IMG = '"><img src=x onerror=alert(1)>'
const asText = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

describe('starter fieldsHtml', () => {
  it('writes a hostile label, help text, option label and value, id and pattern as text', () => {
    const html = fieldsHtml([
      // A migrated model keeps the source form's help text as the field's description, shown as its label (features.ts formFields).
      { id: 'topic', def: { type: 'select', label: `Topic ${SCRIPT}`, options: [SCRIPT, IMG] } },
      { id: 'note', def: { type: 'text', label: `Help: ${IMG}` } },
      { id: `x${IMG}`, def: { type: 'string', required: true, pattern: IMG, max: 10 } },
    ])
    expect(html).not.toMatch(/<script|<img|onerror=alert\(1\)>/)
    expect(html).toContain(`<label for="cr-field-topic">Topic ${asText(SCRIPT)}</label>`)
    expect(html).toContain(`<option value="${asText(SCRIPT)}">${asText(SCRIPT)}</option>`)
    expect(html).toContain(`<option value="${asText(IMG)}">${asText(IMG)}</option>`)
    expect(html).toContain(`<label for="cr-field-note">Help: ${asText(IMG)}</label>`)
    expect(html).toContain(`pattern="${asText(IMG)}"`)
    expect(html).toContain(`name="x${asText(IMG)}"`)
  })

  it('draws a label, the control and the required mark per field', () => {
    expect(fieldsHtml([{ id: 'email', def: { type: 'email', label: 'Email', required: true } }], 'cr-static')).toBe(
      '<p class="cr-field cr-field--email"><label for="cr-static-email">Email <span aria-hidden="true">*</span></label><input type="email" id="cr-static-email" name="email" required /></p>',
    )
  })
})

// A form's fields as server-rendered HTML: the same markup embed.ts's formHtml draws in the browser, so the page
// carries the form (its labels, its select options) before any script runs, and a mount that replaces it does not
// move a thing.
import { esc, type FieldDef, fieldControl, labelFor } from './embed'

export function fieldsHtml(fields: ReadonlyArray<{ id: string, def: FieldDef }>, prefix = 'cr-field'): string {
  return fields.map(({ id, def }) => {
    const control = fieldControl(id, def, prefix)
    const label = `<label for="${esc(`${prefix}-${id}`)}">${esc(labelFor(id, def))}${def.required ? ' <span aria-hidden="true">*</span>' : ''}</label>`
    return `<p class="cr-field cr-field--${esc(def.type)}">${def.type === 'boolean' ? `${control} ${label}` : label + control}</p>`
  }).join('')
}

// Where a form or a comment thread goes on this site (site.config.ts `features`):
// the one place components ask, so a section never shows an empty form column.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { siteConfig } from '../site.config'
import type { FieldDef } from './studio/embed'

export type FormHome = 'studio' | 'endpoint' | 'mailto' | 'wordpress'

const EMAIL = /^[^\s@<>"?&]+@[^\s@<>"?&]+\.[^\s@<>"?&]+$/

/** The address of this page on the WordPress site that kept a feature, or undefined. */
export function onWordPress(pathname: string): string | undefined {
  const base = siteConfig.features?.wordpress
  return base ? new URL(pathname, base).href : undefined
}

/**
 * The public fields of a form model (.contentrain/models/<model>.json): `form.exposedFields`, else every field — the
 * ones Studio's form shows, so posting to the owner's service instead changes the transport, not the form. A migrated
 * model keeps the source form's label as the field's description.
 */
export function formFields(model: string): Array<{ id: string, def: FieldDef }> {
  interface ModelFile { fields?: Record<string, FieldDef & { description?: string }>, form?: { exposedFields?: string[] } }
  let definition: ModelFile = {}
  try { definition = JSON.parse(readFileSync(join(process.cwd(), '.contentrain/models', `${model}.json`), 'utf8')) as ModelFile }
  catch { definition = {} }
  const all = definition.fields ?? {}
  return (definition.form?.exposedFields ?? Object.keys(all)).filter(id => all[id]).map((id) => {
    const def = all[id]!
    const label = def.label ?? def.description
    return { id, def: label ? { ...def, label } : def }
  })
}

/**
 * How the form for `model` renders here, or null when nothing can: Studio not bound yet, the WordPress address
 * unknown, a service address that is not https, a model with no public fields, an address that is not an email.
 */
export function formHome(model: string): FormHome | null {
  const forms = siteConfig.features?.forms ?? { home: 'studio' as const }
  if (forms.home === 'studio') return siteConfig.studio ? 'studio' : null
  if (forms.home === 'wordpress') return siteConfig.features?.wordpress ? 'wordpress' : null
  if (forms.home === 'mailto') return EMAIL.test(forms.address) ? 'mailto' : null
  return forms.action.startsWith('https://') && formFields(model).length > 0 ? 'endpoint' : null
}

/** How a comment thread renders here: Studio's (ready or pending), or a link to it on WordPress. */
export function commentsHome(): 'studio' | 'wordpress' {
  return siteConfig.features?.comments?.home === 'wordpress' && siteConfig.features.wordpress ? 'wordpress' : 'studio'
}

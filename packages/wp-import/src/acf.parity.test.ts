import { readFileSync } from 'node:fs'
import type { FieldDef } from '@contentrain/types'
import { describe, expect, it } from 'vitest'
import { ACF_MAPPING_VERSION, acfFieldDef, acfRows, acfScrub, acfValue } from './acf'

// The ACF parity fixture: the cases the Contentrain Bridge copies and checks against its own export.

interface SubField { name: string; type: string }
interface Field { type: string; choices?: string[]; multiple?: boolean; sub_fields?: SubField[]; layouts?: Record<string, SubField[]> }
interface Case { name: string; field: Field; value: unknown; expect: { def: FieldDef | null; value?: unknown; dropped?: number } }
const fixture = JSON.parse(readFileSync(new URL('./fixtures/acf-parity.json', import.meta.url), 'utf8')) as { mapping_version: number; cases: Case[] }

/** A row as SCF's REST sends it: each sub-field with `<name>_source` stating its type. */
const withSources = (row: Record<string, unknown>, subs: SubField[]): Record<string, unknown> => {
  const out: Record<string, unknown> = { ...row }
  for (const s of subs) {
    if (!(s.name in row)) continue
    out[`${s.name}_source`] = { type: s.type, label: s.name }
    const nested = (s as SubField & { sub_fields?: SubField[] }).sub_fields
    if (nested && Array.isArray(row[s.name])) out[s.name] = (row[s.name] as Record<string, unknown>[]).map((r) => withSources(r, nested))
  }
  return out
}
function restShape(field: Field, value: unknown): unknown {
  if (field.type === 'group' && field.sub_fields) return withSources(value as Record<string, unknown>, field.sub_fields)
  if (field.type === 'repeater' && field.sub_fields) return (value as Record<string, unknown>[]).map((r) => withSources(r, field.sub_fields!))
  if (field.type === 'flexible_content' && field.layouts) return (value as Record<string, unknown>[]).map((r) => withSources(r, field.layouts![String(r.acf_fc_layout)] ?? []))
  return value
}

/** What the fixture compares of a definition: type, options, fields, items, required. */
function shape(def: FieldDef | null): unknown {
  if (!def) return null
  const out: Record<string, unknown> = { type: def.type }
  if (def.options) out.options = def.options
  if (def.required) out.required = true
  if (def.fields) out.fields = Object.fromEntries(Object.entries(def.fields).map(([k, d]) => [k, shape(d)]))
  if (def.items !== undefined) out.items = typeof def.items === 'string' ? { type: def.items } : shape(def.items)
  return out
}

describe('ACF parity fixture (wp-import side)', () => {
  it('is for this mapping version', () => {
    expect(fixture.mapping_version).toBe(ACF_MAPPING_VERSION)
  })

  it.each(fixture.cases.map((c) => [c.name, c] as const))('%s', (_name, c) => {
    const value = acfScrub(restShape(c.field, c.value))
    const def = acfFieldDef('field', value, { type: c.field.type, choices: c.field.choices, multiple: c.field.multiple })
    expect(shape(def)).toEqual(c.expect.def)
    let dropped = 0
    const stored = def ? acfValue(def, acfRows(value), () => dropped++) : undefined
    if ('value' in c.expect) expect(stored).toEqual(c.expect.value)
    else expect(stored).toBeUndefined()
    expect(dropped).toBe(c.expect.dropped ?? 0)
    expect(JSON.stringify(stored ?? null)).not.toContain('GOLDEN-ACF-PASSWORD-SECRET')
  })
})

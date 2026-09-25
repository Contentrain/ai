// The plan's own models (`origin: 'plan'`, section content lifted out of
// builder pages) as Contentrain model files, and the project config that
// lists their domains. Imported models are wp-import's and are not rewritten.

import { canonicalStringify, isTitleFieldType, type ModelDefinition, type PlanModel, type ProjectPlan } from '@contentrain/types'

export function planModelDefinition(model: PlanModel): ModelDefinition {
  if (model.origin !== 'plan') throw new Error(`model ${model.id} is imported; the writer does not write it`)
  if (!model.name || !model.domain || !model.fields) throw new Error(`plan model ${model.id} needs name, domain and fields`)
  const title = model.title_field ?? Object.entries(model.fields).find(([, def]) => isTitleFieldType(def.type))?.[0]
  if (!title) throw new Error(`plan model ${model.id} has no title_field and no text-like field to show as one`)
  return {
    id: model.id,
    name: model.name,
    kind: model.kind,
    domain: model.domain,
    i18n: model.i18n ?? false,
    title_field: title,
    fields: model.fields,
  }
}

/** `.contentrain/models/<id>.json` for every plan model, canonical. */
export function planModelFiles(plan: ProjectPlan): Record<string, string> {
  const files: Record<string, string> = {}
  for (const model of plan.models) {
    if (model.origin !== 'plan') continue
    if (!/^[a-z0-9][a-z0-9-]*$/.test(model.id)) throw new Error(`plan model id ${model.id} is not a file-safe id`)
    files[`.contentrain/models/${model.id}.json`] = canonicalStringify(planModelDefinition(model))
  }
  return files
}

/** The project config with the plan models' domains added. */
export function configWithDomains(config: { domains?: string[] } & Record<string, unknown>, plan: ProjectPlan): string {
  const domains = new Set(config.domains ?? [])
  for (const model of plan.models) if (model.origin === 'plan' && model.domain) domains.add(model.domain)
  return canonicalStringify({ ...config, domains: [...domains].toSorted() })
}

/**
 * The imported models with what the starter's code reads added. wp-import writes what WordPress has;
 * the starter also reads fields a WordPress export does not carry (a page's cover, SEO overrides, the
 * site's logo) and models it does not import (menus, interface strings). An imported field wins — its
 * type and constraints describe the imported content; a starter field is added only where the import
 * has none, optional, so existing entries stay valid.
 */
export function mergeStarterModels(starter: readonly ModelDefinition[], imported: readonly ModelDefinition[]): { models: ModelDefinition[], added: Record<string, string[]> } {
  const byId = new Map(imported.map(m => [m.id, m]))
  const added: Record<string, string[]> = {}
  const models: ModelDefinition[] = [...imported]
  for (const base of starter) {
    const own = byId.get(base.id)
    if (!own) {
      models.push(base)
      added[base.id] = ['(model)']
      continue
    }
    const extra = Object.entries(base.fields ?? {}).filter(([name]) => !own.fields?.[name])
    if (!extra.length) continue
    added[base.id] = extra.map(([name]) => name)
    const fields = { ...own.fields }
    for (const [name, def] of extra) fields[name] = { ...def, required: false }
    models[models.indexOf(own)] = { ...own, fields }
  }
  return { models: models.toSorted((a, b) => a.id.localeCompare(b.id)), added }
}

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

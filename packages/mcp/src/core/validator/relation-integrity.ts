import type { FieldDef, ValidationError } from '@contentrain/types'

/**
 * Check relation referential integrity: verify that the IDs/slugs referenced
 * by `relation` and `relations` fields actually exist in their target model's
 * content. I/O is isolated from the synchronous `validateContent` call so
 * callers can decide when (if ever) to pay the lookup cost.
 *
 * `loadContent(modelId, locale)` is a host-provided callback that returns the
 * object-map content for a model at a locale (or null if the file is missing).
 * MCP wires it to `readJson` over the local filesystem; Studio wires it to a
 * `GitProvider.readFile`-backed loader. The validator stays agnostic.
 *
 * Severity is `warning` — a broken reference should surface but not block
 * writes (matches Studio's existing behaviour; MCP's legacy `checkRelation`
 * raised `error`, but the unified policy leans towards warnings to avoid
 * blocking content writes while a referenced entry is being drafted).
 */
export async function checkRelationIntegrity(
  data: Record<string, unknown>,
  fields: Record<string, FieldDef>,
  modelId: string,
  locale: string,
  entryId: string | undefined,
  loadContent: (targetModelId: string, targetLocale: string) => Promise<Record<string, unknown> | null>,
): Promise<ValidationError[]> {
  const errors: ValidationError[] = []

  for (const [fieldId, def] of Object.entries(fields)) {
    const value = data[fieldId]
    if (value === null || value === undefined) continue

    if (def.type === 'relation' && def.model) {
      const targets = Array.isArray(def.model) ? def.model : [def.model]

      if (targets.length > 1 && typeof value === 'object' && value !== null) {
        const polyVal = value as { model: string, ref: string }
        if (polyVal.model && polyVal.ref) {
          const targetContent = await loadContent(polyVal.model, locale)
          if (targetContent && !(polyVal.ref in targetContent)) {
            errors.push({
              severity: 'warning',
              model: modelId,
              locale,
              entry: entryId,
              field: fieldId,
              message: `Broken relation: "${polyVal.ref}" not found in ${polyVal.model}`,
            })
          }
        }
      } else if (typeof value === 'string' && targets[0]) {
        const targetContent = await loadContent(targets[0], locale)
        if (targetContent && !(value in targetContent)) {
          errors.push({
            severity: 'warning',
            model: modelId,
            locale,
            entry: entryId,
            field: fieldId,
            message: `Broken relation: "${value}" not found in ${targets[0]}`,
          })
        }
      }
    }

    if (def.type === 'relations' && def.model && Array.isArray(value)) {
      const target = Array.isArray(def.model) ? def.model[0] : def.model
      if (target) {
        const targetContent = await loadContent(target, locale)
        if (targetContent) {
          for (const ref of value) {
            if (typeof ref === 'string' && !(ref in targetContent)) {
              errors.push({
                severity: 'warning',
                model: modelId,
                locale,
                entry: entryId,
                field: fieldId,
                message: `Broken relation: "${ref}" not found in ${target}`,
              })
            }
          }
        }
      }
    }
  }

  return errors
}

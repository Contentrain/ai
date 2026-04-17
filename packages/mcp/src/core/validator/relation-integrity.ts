import type { FieldDef, ValidationError } from '@contentrain/types'

/**
 * Resolution of a target model for a relation integrity check.
 *
 * - `{ exists: true, content: {...} }` — target model is known and its
 *   content for the requested locale was loaded. The ref must appear
 *   as a key in `content`.
 * - `{ exists: true, content: null }` — target model exists (e.g. a
 *   singleton or dictionary) but per-entry key enforcement does not
 *   apply. The checker skips the ref existence test for this target.
 * - `{ exists: false }` — the referenced model is not defined at all.
 *   The checker emits a "target model not found" error.
 */
export interface ResolvedTarget {
  exists: boolean
  content?: Record<string, unknown> | null
}

/** Back-compat loader signature used by Studio. A null return means "nothing to check". */
export type LegacyLoadContent = (
  targetModelId: string,
  targetLocale: string,
) => Promise<Record<string, unknown> | null>

export interface CheckRelationIntegrityOptions {
  /** Severity for broken-relation errors. Default: `warning` (Studio-compat). */
  severity?: 'error' | 'warning'
  /**
   * Richer target resolver — when provided, it can signal target-model
   * absence. MCP's project validator passes one so `contentrain_validate`
   * still emits "target model not found" errors.
   */
  resolveTarget?: (
    targetModelId: string,
    targetLocale: string,
  ) => Promise<ResolvedTarget>
}

/**
 * Verify that relation and relations fields reference targets that actually
 * exist. Two severities are supported — Studio's per-save flow emits
 * `warning` (the referenced entry may still be drafted), while MCP's
 * project-wide validator emits `error` and additionally flags missing
 * target models via `resolveTarget`.
 *
 * The loader abstraction keeps this function I/O-agnostic: MCP wires it
 * to filesystem reads through LocalReader, Studio wires it to a
 * `GitProvider.readFile`-backed loader, mocks pass in-memory maps.
 */
export async function checkRelationIntegrity(
  data: Record<string, unknown>,
  fields: Record<string, FieldDef>,
  modelId: string,
  locale: string,
  entryId: string | undefined,
  loadContent: LegacyLoadContent,
  opts: CheckRelationIntegrityOptions = {},
): Promise<ValidationError[]> {
  const errors: ValidationError[] = []
  const severity = opts.severity ?? 'warning'

  const resolve = opts.resolveTarget
    ?? (async (id: string, loc: string): Promise<ResolvedTarget> => {
      const content = await loadContent(id, loc)
      return { exists: true, content }
    })

  for (const [fieldId, def] of Object.entries(fields)) {
    const value = data[fieldId]
    if (value === null || value === undefined) continue

    if (def.type === 'relation' && def.model) {
      const targets = Array.isArray(def.model) ? def.model : [def.model]

      if (targets.length > 1 && typeof value === 'object' && value !== null) {
        const polyVal = value as { model: string, ref: string }
        if (polyVal.model && polyVal.ref) {
          const resolved = await resolve(polyVal.model, locale)
          if (!resolved.exists) {
            errors.push({
              severity,
              model: modelId,
              locale,
              entry: entryId,
              field: fieldId,
              message: `Broken relation: target model "${polyVal.model}" not found`,
            })
          } else if (resolved.content && !(polyVal.ref in resolved.content)) {
            errors.push({
              severity,
              model: modelId,
              locale,
              entry: entryId,
              field: fieldId,
              message: `Broken relation: "${polyVal.ref}" not found in ${polyVal.model}`,
            })
          }
        }
      } else if (typeof value === 'string' && targets[0]) {
        const resolved = await resolve(targets[0], locale)
        if (!resolved.exists) {
          errors.push({
            severity,
            model: modelId,
            locale,
            entry: entryId,
            field: fieldId,
            message: `Broken relation: target model "${targets[0]}" not found`,
          })
        } else if (resolved.content && !(value in resolved.content)) {
          errors.push({
            severity,
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
        const resolved = await resolve(target, locale)
        if (!resolved.exists) {
          errors.push({
            severity,
            model: modelId,
            locale,
            entry: entryId,
            field: fieldId,
            message: `Broken relation: target model "${target}" not found`,
          })
        } else if (resolved.content) {
          for (const ref of value) {
            if (typeof ref === 'string' && !(ref in resolved.content)) {
              errors.push({
                severity,
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

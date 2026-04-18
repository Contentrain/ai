import type { FieldDef, ModelDefinition, ValidationError, ValidationResult } from '@contentrain/types'
import { detectSecrets, validateFieldValue } from '@contentrain/types'

/**
 * Context for cross-entry validation (unique, relations, nested references).
 *
 * Shape aligned with Studio's `content-validation.ts:ValidationContext` so
 * Studio can swap its internal implementation for this module without
 * touching call sites.
 */
export interface ValidationContext {
  /** All entries in the collection (for unique-constraint checks). Keyed by entry ID. */
  allEntries?: Record<string, Record<string, unknown>>
  /** ID of the entry being validated (excluded from unique-constraint comparisons). */
  currentEntryId?: string
  /** All model definitions, if available (reserved for future cross-model checks). */
  models?: ModelDefinition[]
}

/**
 * Validate a single content entry against its model's field schema.
 *
 * Merges the rule sets from MCP's legacy `validator.ts` (secret detection,
 * schema validation, unique constraints) with Studio's `content-validation.ts`
 * (email/url heuristics, polymorphic relation structure, nested object and
 * array-of-object recursion). The union is the authoritative per-entry
 * validator — both MCP's project validator and Studio's save path should
 * converge on this function over time.
 *
 * Asynchronous relation-integrity checks (does the referenced entry exist?)
 * live in `relation-integrity.ts` because they require I/O.
 */
export function validateContent(
  data: Record<string, unknown>,
  fields: Record<string, FieldDef>,
  modelId: string,
  locale: string,
  entryId?: string,
  ctx?: ValidationContext,
): ValidationResult {
  const errors: ValidationError[] = []

  for (const [fieldId, def] of Object.entries(fields)) {
    const value = data[fieldId]
    errors.push(...validateField(value, def, modelId, locale, entryId, fieldId, ctx))
  }

  return {
    valid: errors.filter(e => e.severity === 'error').length === 0,
    errors,
  }
}

function validateField(
  value: unknown,
  def: FieldDef,
  modelId: string,
  locale: string,
  entryId: string | undefined,
  fieldId: string,
  ctx?: ValidationContext,
): ValidationError[] {
  const errors: ValidationError[] = []
  const errCtx = { model: modelId, locale, entry: entryId, field: fieldId }

  if (value !== null && value !== undefined && value !== '') {
    const secretErrors = detectSecrets(value)
    for (const e of secretErrors) {
      errors.push({ ...e, ...errCtx })
    }
  }

  const isRelationType = def.type === 'relation' || def.type === 'relations'
  if (!isRelationType) {
    const fieldErrors = validateFieldValue(value, def)
    if (fieldErrors.length > 0) {
      for (const e of fieldErrors) errors.push({ ...e, ...errCtx })
      if (fieldErrors.some(e => e.severity === 'error')) return errors
    }
  } else if (def.required && (value === null || value === undefined || value === '')) {
    errors.push({ severity: 'error', ...errCtx, message: `${fieldId} is required` })
    return errors
  }

  if (value === null || value === undefined) return errors

  if (def.unique && ctx?.allEntries) {
    // String() comparison — matches legacy validator.ts uniqueness semantics
    // (catches cross-type duplicates like 42 vs '42' that strict === would miss).
    const valueKey = String(value)
    for (const [otherId, otherEntry] of Object.entries(ctx.allEntries)) {
      if (otherId === ctx.currentEntryId) continue
      const otherValue = otherEntry[fieldId]
      if (otherValue !== null && otherValue !== undefined && String(otherValue) === valueKey) {
        errors.push({
          severity: 'error',
          ...errCtx,
          message: `${fieldId} must be unique — "${String(value)}" already exists in entry ${otherId}`,
        })
        break
      }
    }
  }

  if (def.type === 'email' && typeof value === 'string' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    errors.push({ severity: 'warning', ...errCtx, message: `${fieldId} may not be a valid email` })
  }
  if (def.type === 'url' && typeof value === 'string' && !/^https?:\/\/.+/.test(value) && !value.startsWith('/')) {
    errors.push({ severity: 'warning', ...errCtx, message: `${fieldId} may not be a valid URL` })
  }

  if (def.type === 'relation' && def.model) {
    const targets = Array.isArray(def.model) ? def.model : [def.model]
    if (targets.length > 1) {
      if (typeof value !== 'object' || value === null || !('model' in value) || !('ref' in value)) {
        errors.push({
          severity: 'error',
          ...errCtx,
          message: `${fieldId} must be { model, ref } for polymorphic relation`,
        })
      } else {
        const polyVal = value as { model: string, ref: string }
        if (!targets.includes(polyVal.model)) {
          errors.push({
            severity: 'error',
            ...errCtx,
            message: `${fieldId} target model "${polyVal.model}" must be one of: ${targets.join(', ')}`,
          })
        }
      }
    } else if (typeof value !== 'string') {
      errors.push({ severity: 'error', ...errCtx, message: `${fieldId} must be a string (entry ID or slug)` })
    }
  }

  if (def.type === 'relations') {
    if (!Array.isArray(value)) {
      errors.push({ severity: 'error', ...errCtx, message: `${fieldId} must be an array` })
    } else {
      if (def.min !== undefined && value.length < def.min) {
        errors.push({ severity: 'error', ...errCtx, message: `${fieldId} must have at least ${def.min} items` })
      }
      if (def.max !== undefined && value.length > def.max) {
        errors.push({ severity: 'error', ...errCtx, message: `${fieldId} must have at most ${def.max} items` })
      }
      for (let i = 0; i < value.length; i++) {
        if (typeof value[i] !== 'string') {
          errors.push({ severity: 'error', ...errCtx, message: `${fieldId}[${i}] must be a string (entry ID or slug)` })
        }
      }
    }
  }

  if (def.type === 'array' && Array.isArray(value) && def.items && typeof def.items === 'string') {
    for (let i = 0; i < value.length; i++) {
      errors.push(...validateArrayItemType(value[i], def.items, errCtx, `${fieldId}[${i}]`))
    }
  }

  if (def.type === 'object' && def.fields && typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const nested = validateContent(value as Record<string, unknown>, def.fields, modelId, locale, entryId)
    errors.push(...nested.errors)
  }

  if (
    def.type === 'array'
    && Array.isArray(value)
    && def.items
    && typeof def.items === 'object'
    && def.items.type === 'object'
    && def.items.fields
  ) {
    for (let i = 0; i < value.length; i++) {
      if (typeof value[i] === 'object' && value[i] !== null) {
        const nested = validateContent(value[i] as Record<string, unknown>, def.items.fields, modelId, locale, entryId)
        for (const e of nested.errors) {
          errors.push({ ...e, field: `${fieldId}[${i}].${e.field}` })
        }
      }
    }
  }

  return errors
}

function validateArrayItemType(
  value: unknown,
  itemType: string,
  errCtx: { model: string, locale: string, entry: string | undefined, field: string },
  fieldPath: string,
): ValidationError[] {
  const ctx = { ...errCtx, field: fieldPath }
  switch (itemType) {
    case 'string':
    case 'email':
    case 'url':
    case 'slug':
    case 'image':
    case 'video':
    case 'file':
      if (typeof value !== 'string') return [{ severity: 'error', ...ctx, message: `${fieldPath} must be a string` }]
      break
    case 'number':
    case 'integer':
    case 'decimal':
      if (typeof value !== 'number') return [{ severity: 'error', ...ctx, message: `${fieldPath} must be a number` }]
      if (itemType === 'integer' && !Number.isInteger(value)) {
        return [{ severity: 'error', ...ctx, message: `${fieldPath} must be an integer` }]
      }
      break
    case 'boolean':
      if (typeof value !== 'boolean') return [{ severity: 'error', ...ctx, message: `${fieldPath} must be a boolean` }]
      break
  }
  return []
}

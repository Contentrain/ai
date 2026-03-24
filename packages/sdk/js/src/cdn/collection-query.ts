import type { CollectionDataSource } from './data-source.js'
import type { HttpTransport } from './http-transport.js'

type WhereOp = 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'contains'

interface WhereClause {
  field: string
  op: WhereOp
  value: unknown
}

export class CdnCollectionQuery<T extends object> {
  private _transport: HttpTransport
  private _source: CollectionDataSource<T>
  private _modelId: string
  private _locale: string = 'en'
  private _filters: WhereClause[] = []
  private _sortField: string | null = null
  private _sortOrder: 'asc' | 'desc' = 'asc'
  private _limit: number | null = null
  private _offset = 0
  private _includes: string[] = []

  constructor(transport: HttpTransport, modelId: string, defaultLocale?: string) {
    this._transport = transport
    this._source = transport.collection<T>(modelId)
    this._modelId = modelId
    if (defaultLocale) this._locale = defaultLocale
  }

  locale(lang: string): this {
    this._locale = lang
    return this
  }

  where(field: string, op: WhereOp, value: unknown): this {
    this._filters.push({ field, op, value })
    return this
  }

  sort(field: string, order: 'asc' | 'desc' = 'asc'): this {
    this._sortField = field
    this._sortOrder = order
    return this
  }

  limit(n: number): this {
    this._limit = n
    return this
  }

  offset(n: number): this {
    this._offset = n
    return this
  }

  include(...fields: string[]): this {
    this._includes.push(...fields)
    return this
  }

  async all(): Promise<T[]> {
    let items = await this._source.getAll(this._locale)

    // Filter
    for (const clause of this._filters) {
      items = items.filter(item => applyWhere(item, clause))
    }

    // Sort
    if (this._sortField) {
      const field = this._sortField
      const dir = this._sortOrder === 'asc' ? 1 : -1
      items = items.toSorted((a, b) => {
        const va = (a as Record<string, unknown>)[field]
        const vb = (b as Record<string, unknown>)[field]
        if (va == null && vb == null) return 0
        if (va == null) return dir
        if (vb == null) return -dir
        if (va < vb) return -dir
        if (va > vb) return dir
        return 0
      })
    }

    // Pagination
    if (this._offset > 0 || this._limit !== null) {
      const end = this._limit !== null ? this._offset + this._limit : undefined
      items = items.slice(this._offset, end)
    }

    // Resolve relations
    if (this._includes.length > 0) {
      items = await this._resolveIncludes(items)
    }

    return items
  }

  async first(): Promise<T | undefined> {
    const items = await this.all()
    return items[0]
  }

  private async _resolveIncludes(items: T[]): Promise<T[]> {
    // Prefetch related collections to avoid N+1
    const cache = new Map<string, Map<string, Record<string, unknown>>>()

    for (const field of this._includes) {
      // Collect all IDs for this field
      for (const item of items) {
        const val = (item as Record<string, unknown>)[field]
        const ids = Array.isArray(val) ? val : val ? [val] : []
        for (const id of ids) {
          if (typeof id !== 'string') continue
          // We don't know the target model from here, so we use field name as hint
          // In production, model metadata would provide this mapping
          if (!cache.has(field)) {
            try {
              const related = await this._transport.fetch<Record<string, unknown>>(`content/${field}/${this._locale}.json`)
              const map = new Map<string, Record<string, unknown>>()
              for (const [entryId, entry] of Object.entries(related)) {
                map.set(entryId, { id: entryId, ...entry as object })
              }
              cache.set(field, map)
            } catch {
              cache.set(field, new Map())
            }
            break
          }
        }
      }
    }

    return items.map(item => {
      const resolved = { ...item }
      const dst = resolved as Record<string, unknown>
      for (const field of this._includes) {
        const related = cache.get(field)
        if (!related) continue
        const val = (item as Record<string, unknown>)[field]
        if (Array.isArray(val)) {
          dst[field] = val.map(id => typeof id === 'string' ? (related.get(id) ?? id) : id)
        } else if (typeof val === 'string') {
          dst[field] = related.get(val) ?? val
        }
      }
      return resolved
    })
  }
}

function applyWhere<T>(item: T, clause: WhereClause): boolean {
  const val = (item as Record<string, unknown>)[clause.field]
  switch (clause.op) {
    case 'eq': return val === clause.value
    case 'ne': return val !== clause.value
    case 'gt': return (val as number) > (clause.value as number)
    case 'gte': return (val as number) >= (clause.value as number)
    case 'lt': return (val as number) < (clause.value as number)
    case 'lte': return (val as number) <= (clause.value as number)
    case 'in': return Array.isArray(clause.value) && (clause.value as unknown[]).includes(val)
    case 'contains': {
      if (typeof val === 'string') return val.includes(clause.value as string)
      if (Array.isArray(val)) return val.includes(clause.value)
      return false
    }
    default: return true
  }
}

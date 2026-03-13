import type { RelationMeta, RelationResolver } from './query.js'

export class DocumentQuery<T extends object> {
  private _data: Map<string, T[]>
  private _locale: string | null = null
  private _filters: Array<(item: T) => boolean> = []
  private _includes: string[] = []
  private _relationMeta: Record<string, RelationMeta>
  private _resolver: RelationResolver | null
  private _defaultLocale: string | null

  constructor(
    data: Map<string, T[]>,
    relationMeta?: Record<string, RelationMeta>,
    resolver?: RelationResolver,
    defaultLocale?: string,
  ) {
    this._data = data
    this._relationMeta = relationMeta ?? {}
    this._resolver = resolver ?? null
    this._defaultLocale = defaultLocale ?? null
  }

  locale(lang: string): this {
    this._locale = lang
    return this
  }

  where<K extends string & keyof T>(field: K, value: T[K]): this {
    this._filters.push((item) => item[field] === value)
    return this
  }

  include(...fields: string[]): this {
    this._includes.push(...fields)
    return this
  }

  bySlug(slug: string): T | undefined {
    const items = this._resolveData()
    const item = items.find(i => (i as Record<string, unknown>)['slug'] === slug)
    if (item && this._includes.length > 0 && this._resolver) {
      return this._resolveIncludes(item)
    }
    return item
  }

  all(): T[] {
    let items = this._resolveData()
    for (const filter of this._filters) {
      items = items.filter(filter)
    }
    if (this._includes.length > 0 && this._resolver) {
      items = items.map(item => this._resolveIncludes(item))
    }
    return items
  }

  first(): T | undefined {
    return this.all()[0]
  }

  private _resolveData(): T[] {
    if (this._locale) {
      return [...(this._data.get(this._locale) ?? [])]
    }
    if (this._defaultLocale) {
      const defaultData = this._data.get(this._defaultLocale)
      if (defaultData) return [...defaultData]
    }
    const firstKey = this._data.keys().next().value
    if (firstKey !== undefined) {
      return [...(this._data.get(firstKey) ?? [])]
    }
    return []
  }

  private _resolveIncludes(item: T): T {
    const resolved = { ...item }
    const src = item as Record<string, unknown>
    const dst = resolved as Record<string, unknown>
    for (const field of this._includes) {
      const meta = this._relationMeta[field]
      if (!meta) continue
      const targets = Array.isArray(meta.target) ? meta.target : [meta.target]

      if (meta.multi) {
        const ids = src[field]
        if (Array.isArray(ids)) {
          dst[field] = ids.map((id) => {
            if (typeof id === 'string') {
              return this._resolveId(targets, id) ?? id
            }
            if (typeof id === 'object' && id !== null && 'model' in id && 'ref' in id) {
              const polyObj = id as { model: string; ref: string }
              return this._resolveId([polyObj.model], polyObj.ref) ?? id
            }
            return id
          })
        }
      } else {
        const id = src[field]
        if (typeof id === 'string') {
          dst[field] = this._resolveId(targets, id) ?? id
        } else if (typeof id === 'object' && id !== null && 'model' in id && 'ref' in id) {
          const polyObj = id as { model: string; ref: string }
          dst[field] = this._resolveId([polyObj.model], polyObj.ref) ?? id
        }
      }
    }
    return resolved
  }

  private _resolveId(targets: string[], id: string): Record<string, unknown> | undefined {
    for (const target of targets) {
      const result = this._resolver!(target, id, this._locale)
      if (result) return result
    }
    return undefined
  }
}

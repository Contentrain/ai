export class QueryBuilder<T extends Record<string, unknown>> {
  private _data: Map<string, T[]>
  private _locale: string | null = null
  private _filters: Array<(item: T) => boolean> = []
  private _sortField: string | null = null
  private _sortOrder: 'asc' | 'desc' = 'asc'
  private _limit: number | null = null
  private _offset = 0

  constructor(data: Map<string, T[]>) {
    this._data = data
  }

  locale(lang: string): this {
    this._locale = lang
    return this
  }

  where<K extends string & keyof T>(field: K, value: T[K]): this {
    this._filters.push((item) => {
      const v = item[field]
      if (Array.isArray(v)) return v.includes(value)
      return v === value
    })
    return this
  }

  sort<K extends string & keyof T>(field: K, order: 'asc' | 'desc' = 'asc'): this {
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

  all(): T[] {
    let items = this._resolveData()

    // Filter
    for (const filter of this._filters) {
      items = items.filter(filter)
    }

    // Sort
    if (this._sortField) {
      const field = this._sortField
      const dir = this._sortOrder === 'asc' ? 1 : -1
      items.sort((a, b) => {
        const va = a[field]
        const vb = b[field]
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

    return items
  }

  first(): T | undefined {
    return this.all()[0]
  }

  private _resolveData(): T[] {
    if (this._locale) {
      return [...(this._data.get(this._locale) ?? [])]
    }
    // If no locale specified, try to get first available
    const firstKey = this._data.keys().next().value
    if (firstKey !== undefined) {
      return [...(this._data.get(firstKey) ?? [])]
    }
    return []
  }
}

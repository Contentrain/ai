export class DocumentQuery<T extends Record<string, unknown>> {
  private _data: Map<string, T[]>
  private _locale: string | null = null
  private _filters: Array<(item: T) => boolean> = []

  constructor(data: Map<string, T[]>) {
    this._data = data
  }

  locale(lang: string): this {
    this._locale = lang
    return this
  }

  where<K extends string & keyof T>(field: K, value: T[K]): this {
    this._filters.push((item) => item[field] === value)
    return this
  }

  bySlug(slug: string): T | undefined {
    const items = this._resolveData()
    return items.find(item => (item as Record<string, unknown>)['slug'] === slug)
  }

  all(): T[] {
    let items = this._resolveData()
    for (const filter of this._filters) {
      items = items.filter(filter)
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
    const firstKey = this._data.keys().next().value
    if (firstKey !== undefined) {
      return [...(this._data.get(firstKey) ?? [])]
    }
    return []
  }
}

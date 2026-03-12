export class SingletonAccessor<T extends Record<string, unknown>> {
  private _data: Map<string, T>
  private _locale: string | null = null

  constructor(data: Map<string, T>) {
    this._data = data
  }

  locale(lang: string): this {
    this._locale = lang
    return this
  }

  get(): T {
    if (this._locale) {
      const d = this._data.get(this._locale)
      if (!d) throw new Error(`No data for locale "${this._locale}"`)
      return d
    }
    const firstKey = this._data.keys().next().value
    if (firstKey !== undefined) {
      return this._data.get(firstKey)!
    }
    throw new Error('No data available')
  }
}

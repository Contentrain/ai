export class DictionaryAccessor {
  private _data: Map<string, Record<string, string>>
  private _locale: string | null = null
  private _defaultLocale: string | null

  constructor(data: Map<string, Record<string, string>>, defaultLocale?: string) {
    this._data = data
    this._defaultLocale = defaultLocale ?? null
  }

  locale(lang: string): this {
    this._locale = lang
    return this
  }

  get(): Record<string, string>
  get(key: string): string | undefined
  get(key?: string): Record<string, string> | string | undefined {
    const dict = this._resolveData()
    if (key !== undefined) return dict[key]
    return dict
  }

  private _resolveData(): Record<string, string> {
    if (this._locale) {
      return this._data.get(this._locale) ?? {}
    }
    if (this._defaultLocale) {
      const d = this._data.get(this._defaultLocale)
      if (d) return d
    }
    const firstKey = this._data.keys().next().value
    if (firstKey !== undefined) {
      return this._data.get(firstKey) ?? {}
    }
    return {}
  }
}

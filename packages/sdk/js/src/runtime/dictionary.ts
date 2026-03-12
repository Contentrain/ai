export class DictionaryAccessor {
  private _data: Map<string, Record<string, string>>
  private _locale: string | null = null

  constructor(data: Map<string, Record<string, string>>) {
    this._data = data
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
    const firstKey = this._data.keys().next().value
    if (firstKey !== undefined) {
      return this._data.get(firstKey) ?? {}
    }
    return {}
  }
}

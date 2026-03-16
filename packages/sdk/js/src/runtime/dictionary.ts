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
  get(key: string, params: Record<string, string | number>): string
  get(key?: string, params?: Record<string, string | number>): Record<string, string> | string | undefined {
    const dict = this._resolveData()
    if (key === undefined) return dict
    const value = dict[key]
    if (value === undefined) return undefined
    if (params) return interpolate(value, params)
    return value
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

function interpolate(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const val = params[key]
    return val !== undefined ? String(val) : match
  })
}

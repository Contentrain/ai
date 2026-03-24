import type { DictionaryDataSource } from './data-source.js'

export class CdnDictionaryAccessor {
  private _source: DictionaryDataSource
  private _locale: string = 'en'

  constructor(source: DictionaryDataSource, defaultLocale?: string) {
    this._source = source
    if (defaultLocale) this._locale = defaultLocale
  }

  locale(lang: string): this {
    this._locale = lang
    return this
  }

  async get(): Promise<Record<string, string>>
  async get(key: string): Promise<string | undefined>
  async get(key: string, params: Record<string, string | number>): Promise<string>
  async get(key?: string, params?: Record<string, string | number>): Promise<Record<string, string> | string | undefined> {
    const dict = await this._source.get(this._locale)
    if (key === undefined) return dict
    const value = dict[key]
    if (value === undefined) return undefined
    if (params) return interpolate(value, params)
    return value
  }
}

function interpolate(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const val = params[key]
    return val !== undefined ? String(val) : match
  })
}

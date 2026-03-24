import type { SingletonDataSource } from './data-source.js'

export class CdnSingletonAccessor<T extends Record<string, unknown>> {
  private _source: SingletonDataSource<T>
  private _locale: string = 'en'

  constructor(source: SingletonDataSource<T>, defaultLocale?: string) {
    this._source = source
    if (defaultLocale) this._locale = defaultLocale
  }

  locale(lang: string): this {
    this._locale = lang
    return this
  }

  async get(): Promise<T> {
    return this._source.get(this._locale)
  }
}

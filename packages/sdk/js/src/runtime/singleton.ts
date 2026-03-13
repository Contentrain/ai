export class SingletonAccessor<T extends Record<string, unknown>> {
  private _data: Map<string, T>
  private _locale: string | null = null
  private _defaultLocale: string | null
  private _includes: string[] = []
  private _relationMeta: Record<string, { target: string | string[]; multi: boolean }> = {}
  private _resolveEntry?: (model: string, id: string, locale: string) => unknown

  constructor(
    data: Map<string, T>,
    defaultLocale?: string,
    relationMeta?: Record<string, { target: string | string[]; multi: boolean }>,
    resolveEntry?: (model: string, id: string, locale: string) => unknown,
  ) {
    this._data = data
    this._defaultLocale = defaultLocale ?? null
    if (relationMeta) this._relationMeta = relationMeta
    this._resolveEntry = resolveEntry
  }

  locale(lang: string): this {
    this._locale = lang
    return this
  }

  include(...fields: string[]): this {
    this._includes.push(...fields)
    return this
  }

  get(): T {
    if (this._locale) {
      const d = this._data.get(this._locale)
      if (!d) throw new Error(`No data for locale "${this._locale}"`)
      if (this._includes.length > 0) return this._resolveIncludes(d, this._locale)
      return d
    }

    const locale = this._defaultLocale ?? undefined
    let data: T | undefined

    if (locale) {
      data = this._data.get(locale)
    }
    if (!data) {
      const firstKey = this._data.keys().next().value
      if (firstKey !== undefined) {
        data = this._data.get(firstKey)
      }
    }
    if (!data) throw new Error('No data available')

    if (this._includes.length > 0) {
      return this._resolveIncludes(data, locale ?? 'en')
    }
    return data
  }

  private _resolveIncludes(item: T, locale: string): T {
    if (!this._resolveEntry || this._includes.length === 0) return item
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
              return this._resolveId(targets, id, locale) ?? id
            }
            if (typeof id === 'object' && id !== null && 'model' in id && 'ref' in id) {
              const polyObj = id as { model: string; ref: string }
              return this._resolveId([polyObj.model], polyObj.ref, locale) ?? id
            }
            return id
          })
        }
      } else {
        const id = src[field]
        if (typeof id === 'string') {
          dst[field] = this._resolveId(targets, id, locale) ?? id
        } else if (typeof id === 'object' && id !== null && 'model' in id && 'ref' in id) {
          const polyObj = id as { model: string; ref: string }
          dst[field] = this._resolveId([polyObj.model], polyObj.ref, locale) ?? id
        }
      }
    }

    return resolved
  }

  private _resolveId(targets: string[], id: string, locale: string): unknown {
    if (!this._resolveEntry) return undefined
    for (const model of targets) {
      const result = this._resolveEntry(model, id, locale)
      if (result) return result
    }
    return undefined
  }
}

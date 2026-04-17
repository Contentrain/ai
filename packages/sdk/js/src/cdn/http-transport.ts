import { ContentrainError } from './errors.js'
import type { CollectionDataSource, SingletonDataSource, DictionaryDataSource, DocumentDataSource } from './data-source.js'

interface CacheEntry {
  data: unknown
  etag: string
}

export class HttpTransport {
  private _baseUrl: string
  private _projectId: string
  private _apiKey: string
  private _cache = new Map<string, CacheEntry>()

  constructor(config: { baseUrl: string; projectId: string; apiKey: string }) {
    this._baseUrl = config.baseUrl.replace(/\/+$/, '')
    this._projectId = config.projectId
    this._apiKey = config.apiKey
  }

  buildUrl(path: string): string {
    return `${this._baseUrl}/${this._projectId}/${path}`
  }

  async fetch<T>(path: string): Promise<T> {
    const url = `${this._baseUrl}/${this._projectId}/${path}`
    const cached = this._cache.get(path)

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this._apiKey}`,
    }
    if (cached?.etag) {
      headers['If-None-Match'] = cached.etag
    }

    const res = await globalThis.fetch(url, { headers })

    if (res.status === 304 && cached) return cached.data as T
    if (!res.ok) throw new ContentrainError(res.status, await res.text())

    const data = (await res.json()) as T
    const etag = res.headers.get('etag') ?? ''
    if (etag) {
      this._cache.set(path, { data, etag })
    }
    return data
  }

  collection<T>(modelId: string): CollectionDataSource<T> {
    return {
      getAll: async (locale) => {
        const map = await this.fetch<Record<string, T>>(`content/${modelId}/${locale}.json`)
        return Object.entries(map).map(([id, entry]) => Object.assign({ id }, entry as object) as T)
      },
      getOne: async (id, locale) => {
        const map = await this.fetch<Record<string, T>>(`content/${modelId}/${locale}.json`)
        const entry = map[id]
        return entry ? { id, ...entry as object } as T : null
      },
    }
  }

  singleton<T>(modelId: string): SingletonDataSource<T> {
    return {
      get: (locale) => this.fetch<T>(`content/${modelId}/${locale}.json`),
    }
  }

  dictionary(modelId: string): DictionaryDataSource {
    return {
      get: (locale) => this.fetch<Record<string, string>>(`content/${modelId}/${locale}.json`),
    }
  }

  document<T>(modelId: string): DocumentDataSource<T> {
    return {
      getIndex: (locale) => this.fetch<T[]>(`documents/${modelId}/_index/${locale}.json`),
      getBySlug: (slug, locale) => this.fetch(`documents/${modelId}/${slug}/${locale}.json`),
    }
  }
}

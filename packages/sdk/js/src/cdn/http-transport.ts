import { ContentrainError } from './errors.js'
import type { CollectionDataSource, SingletonDataSource, DictionaryDataSource, DocumentDataSource } from './data-source.js'

interface CacheEntry {
  data: unknown
  etag: string
}

export interface TransportConfig {
  baseUrl: string
  projectId: string
  apiKey: string
  /** Bundle preload mode. `true` → `{ revalidateMs: 60_000 }` */
  bundle?: boolean | { revalidateMs?: number }
  defaultLocale?: string
}

interface BundleState {
  fetchedAt: number
  paths: Set<string>
  missing: boolean
  inflight: Promise<void> | null
}

interface BundlePayload {
  version?: string
  paths?: Record<string, unknown>
}

/** Paths eligible for bundle serving — everything else (manifests, models/*) has no locale segment. */
const BUNDLE_SCOPE = /^(content|documents|meta)\//

export class HttpTransport {
  private _baseUrl: string
  private _projectId: string
  private _apiKey: string
  private _cache = new Map<string, CacheEntry>()
  private _bundleMode: boolean
  private _revalidateMs: number
  private _defaultLocale: string
  private _primed = new Map<string, unknown>()
  private _bundles = new Map<string, BundleState>()

  constructor(config: TransportConfig) {
    this._baseUrl = config.baseUrl.replace(/\/+$/, '')
    this._projectId = config.projectId
    this._apiKey = config.apiKey
    const b = config.bundle
    this._bundleMode = !!b
    this._revalidateMs = typeof b === 'object' && typeof b.revalidateMs === 'number' ? b.revalidateMs : 60_000
    this._defaultLocale = config.defaultLocale ?? 'en'
  }

  buildUrl(path: string): string {
    return `${this._baseUrl}/${this._projectId}/${path}`
  }

  /** Eager warmup (e.g. SSR boot). Resolves `true` when a bundle was found and primed. */
  async preload(locale?: string): Promise<boolean> {
    if (!this._bundleMode) return false
    const l = locale ?? this._defaultLocale
    await this._ensureBundle(l)
    return !this._bundles.get(l)?.missing
  }

  async fetch<T>(path: string): Promise<T> {
    if (this._bundleMode && BUNDLE_SCOPE.test(path)) {
      await this._ensureBundle(this._localeOf(path))
      if (this._primed.has(path)) return this._primed.get(path) as T
      // out-of-scope path (doc body, meta, ...) → regular per-path fetch
    }
    return this._networkFetch<T>(path)
  }

  /** Locale from a path's last segment (sans `.json`). `data` (non-i18n) → defaultLocale bundle. */
  private _localeOf(path: string): string {
    const last = path.slice(path.lastIndexOf('/') + 1).replace(/\.json$/, '')
    return last === 'data' ? this._defaultLocale : last
  }

  private _ensureBundle(locale: string): Promise<void> | void {
    const state = this._bundles.get(locale)
    if (state?.inflight) return state.inflight
    if (state && Date.now() - state.fetchedAt < this._revalidateMs) return

    const next: BundleState = state ?? { fetchedAt: 0, paths: new Set(), missing: false, inflight: null }
    this._bundles.set(locale, next)
    next.inflight = (async () => {
      try {
        // _networkFetch is conditional: unchanged bundle → 304 → cached payload (cheap)
        const bundle = await this._networkFetch<BundlePayload>(`_bundle/${locale}.json`)
        if (bundle?.version !== '1' || !bundle.paths || typeof bundle.paths !== 'object') {
          next.missing = true
          return
        }
        // Evict primed paths absent from the fresh bundle (deleted models must not serve stale)
        const fresh = new Set(Object.keys(bundle.paths))
        for (const p of next.paths) {
          if (!fresh.has(p)) this._primed.delete(p)
        }
        for (const [p, body] of Object.entries(bundle.paths)) this._primed.set(p, body)
        next.paths = fresh
        next.missing = false
      }
      catch {
        // 404 (bundle not built yet) or network error → per-path fallback until next revalidate
        next.missing = true
      }
      finally {
        next.fetchedAt = Date.now()
        next.inflight = null
      }
    })()
    return next.inflight
  }

  private async _networkFetch<T>(path: string): Promise<T> {
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

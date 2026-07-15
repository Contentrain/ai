export interface CollectionDataSource<T> {
  getAll(locale: string): Promise<T[]>
  getOne(id: string, locale: string): Promise<T | null>
}

export interface SingletonDataSource<T> {
  get(locale: string): Promise<T>
}

export interface DictionaryDataSource {
  get(locale: string): Promise<Record<string, string>>
}

/**
 * A document entry as it exists in the CDN's `_index` — frontmatter only.
 *
 * The body is not in the index; it lives in the per-slug document and is only
 * reachable through `bySlug()`. This type exists so that reading `.body` off an
 * `all()` result is a compile error rather than `undefined` at runtime: `all()`
 * used to be typed `T[]`, and since the generated document type declares
 * `body: string`, pages rendering `entry.body` type-checked, passed review, and
 * silently shipped without their prose.
 *
 * Note the bundled runtime's `all()` *does* carry bodies. The two delivery modes
 * genuinely differ in shape, so they no longer share one return type.
 */
export type DocumentIndexEntry<T> = Omit<T, 'body'>

export interface DocumentDataSource<T> {
  getIndex(locale: string): Promise<DocumentIndexEntry<T>[]>
  getBySlug(slug: string, locale: string): Promise<{ frontmatter: T; body: string; html: string } | null>
}

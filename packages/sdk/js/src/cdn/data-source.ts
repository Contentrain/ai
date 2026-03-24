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

export interface DocumentDataSource<T> {
  getIndex(locale: string): Promise<T[]>
  getBySlug(slug: string, locale: string): Promise<{ frontmatter: T; body: string; html: string } | null>
}

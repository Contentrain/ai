import type { DocumentDataSource, DocumentIndexEntry } from './data-source.js'
import type { WhereOp, WhereClause } from '../shared/where.js'
import { applyWhere } from '../shared/where.js'

export class CdnDocumentQuery<T extends object> {
  private _source: DocumentDataSource<T>
  private _locale: string = 'en'
  private _filters: WhereClause[] = []
  private _sortField: string | null = null
  private _sortOrder: 'asc' | 'desc' = 'asc'

  constructor(source: DocumentDataSource<T>, defaultLocale?: string) {
    this._source = source
    if (defaultLocale) this._locale = defaultLocale
  }

  locale(lang: string): this {
    this._locale = lang
    return this
  }

  where(field: string, op: WhereOp, value: unknown): this {
    this._filters.push({ field, op, value })
    return this
  }

  sort(field: string, order: 'asc' | 'desc' = 'asc'): this {
    this._sortField = field
    this._sortOrder = order
    return this
  }

  /**
   * Every entry's frontmatter, from the model's `_index`.
   *
   * Bodies are not included — fetch one with {@link bySlug}. See
   * {@link DocumentIndexEntry}.
   */
  async all(): Promise<DocumentIndexEntry<T>[]> {
    let items = await this._source.getIndex(this._locale)

    for (const clause of this._filters) {
      items = items.filter(item => applyWhere(item, clause))
    }

    if (this._sortField) {
      const sf = this._sortField
      const dir = this._sortOrder === 'asc' ? 1 : -1
      items = items.toSorted((a, b) => {
        const va = (a as Record<string, unknown>)[sf] as number | string | null | undefined
        const vb = (b as Record<string, unknown>)[sf] as number | string | null | undefined
        if (va == null && vb == null) return 0
        if (va == null) return dir
        if (vb == null) return -dir
        return va < vb ? -dir : va > vb ? dir : 0
      })
    }

    return items
  }

  async count(): Promise<number> {
    const items = await this.all()
    return items.length
  }

  async first(): Promise<DocumentIndexEntry<T> | undefined> {
    const items = await this.all()
    return items[0]
  }

  /** The full document: frontmatter plus its rendered body. */
  async bySlug(slug: string): Promise<{ frontmatter: T; body: string; html: string } | null> {
    return this._source.getBySlug(slug, this._locale)
  }
}

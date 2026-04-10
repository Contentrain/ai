import type { DocumentDataSource } from './data-source.js'
import type { WhereOp, WhereClause } from '../shared/where.js'
import { applyWhere } from '../shared/where.js'

export class CdnDocumentQuery<T extends object> {
  private _source: DocumentDataSource<T>
  private _locale: string = 'en'
  private _filters: WhereClause[] = []

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

  async all(): Promise<T[]> {
    let items = await this._source.getIndex(this._locale)

    for (const clause of this._filters) {
      items = items.filter(item => applyWhere(item, clause))
    }

    return items
  }

  async count(): Promise<number> {
    const items = await this.all()
    return items.length
  }

  async first(): Promise<T | undefined> {
    const items = await this.all()
    return items[0]
  }

  async bySlug(slug: string): Promise<{ frontmatter: T; body: string; html: string } | null> {
    return this._source.getBySlug(slug, this._locale)
  }
}

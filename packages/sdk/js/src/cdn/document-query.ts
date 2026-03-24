import type { DocumentDataSource } from './data-source.js'

type WhereOp = 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'contains'

interface WhereClause {
  field: string
  op: WhereOp
  value: unknown
}

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

  async first(): Promise<T | undefined> {
    const items = await this.all()
    return items[0]
  }

  async bySlug(slug: string): Promise<{ frontmatter: T; body: string; html: string } | null> {
    return this._source.getBySlug(slug, this._locale)
  }
}

function applyWhere<T>(item: T, clause: WhereClause): boolean {
  const val = (item as Record<string, unknown>)[clause.field]
  switch (clause.op) {
    case 'eq': return val === clause.value
    case 'ne': return val !== clause.value
    case 'gt': return (val as number) > (clause.value as number)
    case 'gte': return (val as number) >= (clause.value as number)
    case 'lt': return (val as number) < (clause.value as number)
    case 'lte': return (val as number) <= (clause.value as number)
    case 'in': return Array.isArray(clause.value) && (clause.value as unknown[]).includes(val)
    case 'contains': {
      if (typeof val === 'string') return val.includes(clause.value as string)
      if (Array.isArray(val)) return val.includes(clause.value)
      return false
    }
    default: return true
  }
}

export type WhereOp = 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'contains'

export interface WhereClause {
  field: string
  op: WhereOp
  value: unknown
}

export function applyWhere<T>(item: T, clause: WhereClause): boolean {
  const val = (item as Record<string, unknown>)[clause.field]
  switch (clause.op) {
    case 'eq': {
      if (Array.isArray(val)) return val.includes(clause.value)
      return val === clause.value
    }
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

import { describe, it, expect } from 'vitest'
import { applyWhere } from '../../src/shared/where.js'

const item = { name: 'Alice', age: 30, tags: ['admin', 'user'], bio: 'Software engineer' }

describe('applyWhere', () => {
  it('eq — exact match', () => {
    expect(applyWhere(item, { field: 'name', op: 'eq', value: 'Alice' })).toBe(true)
    expect(applyWhere(item, { field: 'name', op: 'eq', value: 'Bob' })).toBe(false)
  })

  it('eq — array includes check', () => {
    expect(applyWhere(item, { field: 'tags', op: 'eq', value: 'admin' })).toBe(true)
    expect(applyWhere(item, { field: 'tags', op: 'eq', value: 'guest' })).toBe(false)
  })

  it('ne — not equal', () => {
    expect(applyWhere(item, { field: 'name', op: 'ne', value: 'Bob' })).toBe(true)
    expect(applyWhere(item, { field: 'name', op: 'ne', value: 'Alice' })).toBe(false)
  })

  it('gt — greater than', () => {
    expect(applyWhere(item, { field: 'age', op: 'gt', value: 25 })).toBe(true)
    expect(applyWhere(item, { field: 'age', op: 'gt', value: 30 })).toBe(false)
  })

  it('gte — greater than or equal', () => {
    expect(applyWhere(item, { field: 'age', op: 'gte', value: 30 })).toBe(true)
    expect(applyWhere(item, { field: 'age', op: 'gte', value: 31 })).toBe(false)
  })

  it('lt — less than', () => {
    expect(applyWhere(item, { field: 'age', op: 'lt', value: 35 })).toBe(true)
    expect(applyWhere(item, { field: 'age', op: 'lt', value: 30 })).toBe(false)
  })

  it('lte — less than or equal', () => {
    expect(applyWhere(item, { field: 'age', op: 'lte', value: 30 })).toBe(true)
    expect(applyWhere(item, { field: 'age', op: 'lte', value: 29 })).toBe(false)
  })

  it('in — value in list', () => {
    expect(applyWhere(item, { field: 'name', op: 'in', value: ['Alice', 'Bob'] })).toBe(true)
    expect(applyWhere(item, { field: 'name', op: 'in', value: ['Bob', 'Charlie'] })).toBe(false)
  })

  it('contains — string includes', () => {
    expect(applyWhere(item, { field: 'bio', op: 'contains', value: 'engineer' })).toBe(true)
    expect(applyWhere(item, { field: 'bio', op: 'contains', value: 'designer' })).toBe(false)
  })

  it('contains — array includes', () => {
    expect(applyWhere(item, { field: 'tags', op: 'contains', value: 'admin' })).toBe(true)
    expect(applyWhere(item, { field: 'tags', op: 'contains', value: 'guest' })).toBe(false)
  })

  it('handles null/undefined field values gracefully', () => {
    const sparse = { name: 'Test', age: null }
    expect(applyWhere(sparse, { field: 'age', op: 'eq', value: null })).toBe(true)
    expect(applyWhere(sparse, { field: 'age', op: 'gt', value: 0 })).toBe(false)
    expect(applyWhere(sparse, { field: 'missing', op: 'eq', value: undefined })).toBe(true)
  })
})

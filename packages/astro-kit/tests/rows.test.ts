import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const COMPONENTS = join(import.meta.dirname, '..', 'components')
const read = (...path: string[]) => readFile(join(COMPONENTS, ...path), 'utf8')

describe('a card grid drawn as rows (CardGrid layout rows)', () => {
  it('draws the cards as they were unless `rows` is asked for: middle output does not move', async () => {
    const grid = await read('card-grid', 'CardGrid.astro')
    expect(grid).toContain("{layout === 'rows' ? (")
    expect(grid).toContain('<ul class={list({ class: measuredGrid(measured) })}>')
    expect(grid).toContain("defaultVariants: { columns: '3', style: 'plain', align: 'start' },")
    const meta = JSON.parse(await read('card-grid', 'meta.json'))
    expect(meta.variants.layout).toMatchObject({ options: ['grid', 'rows'], default: 'grid' })
    expect(meta.props.index).toMatchObject({ type: 'boolean', default: false })
  })

  it('keeps every field of an item, numbers an `index` list for sight only, and draws quieter text in the muted role', async () => {
    const grid = await read('card-grid', 'CardGrid.astro')
    const rows = grid.slice(grid.indexOf("{layout === 'rows' ? ("), grid.indexOf(') : ('))
    for (const field of ['item.icon', 'item.eyebrow', 'item.title', 'item.text', 'item.image', 'item.linkLabel']) expect(rows, field).toContain(field)
    expect(grid).toContain("const List = index ? 'ol' : 'ul'")
    expect(rows).toContain('<span class={r.number()} aria-hidden="true">{number(i)}</span>')
    expect(rows).toContain('role="list"')
    expect(grid).toContain('number: `text-sm tabular-nums ${muted}`')
    expect(grid).not.toMatch(/opacity/)
  })
})

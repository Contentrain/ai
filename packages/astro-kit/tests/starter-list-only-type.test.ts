import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(import.meta.dirname, '..')
const STARTER = join(ROOT, '..', '..', 'templates', 'astro-starter', 'src')
const read = (...path: string[]) => readFile(join(STARTER, ...path), 'utf8')

describe('a list-only custom type: entries with no page of their own, listed by title under their terms', () => {
  it('has no entry address, so no entry page, redirect, menu link or relation link is made for it', async () => {
    expect(await read('site.config.ts')).toContain('  single?: string')
    const custom = await read('lib', 'custom.ts')
    expect(custom).toContain('export function entryHref(type: CustomType, entry: TypeEntry): string | undefined {\n  if (type.single === undefined) return undefined\n')
    expect(custom).toContain('if (from && to) out.push({ from, to })')
    expect(await read('lib', 'site-routes.ts')).toContain("if (href) add(href, { view: 'entry', type, entry, targets })")
    expect(await read('lib', 'links.ts')).toContain('return href ? link(href) : undefined')
    expect(await read('lib', 'fields.ts')).toContain("if (href) out.set(`${type.collection}:${entry.id}`, { href, title: titleOf(entry, type.card.title) })")
  })

  it('prints a card without an address as its title, never a dead or # link (the kit card and the full list)', async () => {
    const card = await readFile(join(ROOT, 'components', 'post-card', 'PostCard.astro'), 'utf8')
    expect(card).toContain('  href?: string | undefined\n')
    expect(card).toContain("{href ? <a href={safeHref(href)} class=\"text-current no-underline after:absolute after:inset-0 after:content-[''] hover:text-accent-text\">{title}</a> : title}")
    const list = await read('views', 'ListView.astro')
    expect(list).toContain('{card.href ? <a href={safeHref(card.href)}')
    expect(list).toContain(': card.title}</h2>')
    const meta = JSON.parse(await readFile(join(ROOT, 'components', 'post-card', 'meta.json'), 'utf8'))
    expect(meta.props.href.required).toBeUndefined()
  })
})

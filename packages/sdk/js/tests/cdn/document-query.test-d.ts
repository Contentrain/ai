import { describe, it, expectTypeOf } from 'vitest'
import { CdnDocumentQuery } from '../../src/cdn/document-query.js'
import type { DocumentDataSource, DocumentIndexEntry } from '../../src/cdn/data-source.js'

/** The generated shape for a document model: flat frontmatter plus `body`. */
interface GuideSection {
  slug: string
  title: string
  platform: string
  order: number
  body: string
}

declare const source: DocumentDataSource<GuideSection>
const query = new CdnDocumentQuery<GuideSection>(source, 'tr')

/**
 * The trap this type closes: `all()` used to be typed `T[]`, and the generated
 * document type declares `body: string`. So `entry.body` compiled, returned
 * `undefined` at runtime, and pages silently rendered without their prose.
 */
describe('CdnDocumentQuery type contract', () => {
  it('all() yields index entries without a body', () => {
    expectTypeOf(query.all()).resolves.toEqualTypeOf<DocumentIndexEntry<GuideSection>[]>()
    expectTypeOf<DocumentIndexEntry<GuideSection>>().toHaveProperty('title')
    expectTypeOf<DocumentIndexEntry<GuideSection>>().not.toHaveProperty('body')
  })

  it('makes reading .body off an all() result a compile error', async () => {
    const items = await query.all()
    // @ts-expect-error — body is not on an index entry; use bySlug() to get it.
    void items[0]!.body
  })

  it('first() yields an index entry too', () => {
    expectTypeOf(query.first()).resolves.toEqualTypeOf<DocumentIndexEntry<GuideSection> | undefined>()
  })

  it('bySlug() keeps the body', () => {
    expectTypeOf(query.bySlug('x')).resolves.toEqualTypeOf<
      { frontmatter: GuideSection; body: string; html: string } | null
    >()
  })
})

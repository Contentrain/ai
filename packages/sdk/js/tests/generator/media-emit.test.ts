import { describe, it, expect } from 'vitest'
import type { ModelDefinition } from '@contentrain/types'
import { emitRuntimeModule, emitCjsWrapper } from '../../src/generator/runtime-emitter.js'
import { emitTypes } from '../../src/generator/type-emitter.js'

const COLLECTION: ModelDefinition = {
  id: 'blog-post', name: 'Blog Post', kind: 'collection', domain: 'blog', i18n: true, title_field: 'title',
}
const DATA = [{ fileName: 'blog-post.en.mjs', content: 'export default []' }]

describe('media()/mediaBody() emission', () => {
  describe('emitRuntimeModule', () => {
    it('emits media()/mediaBody() resolvers with a trailing-slash-trimmed base when mediaBaseUrl is set', () => {
      const out = emitRuntimeModule([COLLECTION], DATA, 'en', 'https://cdn.test/api/cdn/v1/proj/')
      expect(out).toContain('const _mediaBase = "https://cdn.test/api/cdn/v1/proj"')
      expect(out).toContain('export function media(value, baseOverride)')
      expect(out).toContain('export function mediaBody(markdown, baseOverride)')
      expect(out).toContain("base = baseOverride ? String(baseOverride).replace(/\\/+$/, '') : _mediaBase")
      expect(out).toContain("return base + '/' + value")
    })

    it('omits media()/mediaBody() and _mediaBase when no base is given', () => {
      const out = emitRuntimeModule([COLLECTION], DATA, 'en')
      expect(out).not.toContain('export function media(')
      expect(out).not.toContain('export function mediaBody(')
      expect(out).not.toContain('_mediaBase')
    })
  })

  describe('emitCjsWrapper', () => {
    it('re-exports media and mediaBody when hasMedia is true', () => {
      const out = emitCjsWrapper([COLLECTION], true)
      expect(out).toContain('module.exports.media = m.media')
      expect(out).toContain('module.exports.mediaBody = m.mediaBody')
    })

    it('does not re-export media/mediaBody by default', () => {
      const out = emitCjsWrapper([COLLECTION])
      expect(out).not.toContain('m.media')
      expect(out).not.toContain('m.mediaBody')
    })
  })

  describe('emitTypes', () => {
    it('declares media() and mediaBody() when hasMedia is true', () => {
      const out = emitTypes([], true)
      expect(out).toContain('export declare function media(value: string, baseOverride?: string): string')
      expect(out).toContain('export declare function mediaBody(markdown: string, baseOverride?: string): string')
    })

    it('omits the media()/mediaBody() declarations by default', () => {
      const out = emitTypes([])
      expect(out).not.toContain('function media(')
      expect(out).not.toContain('function mediaBody(')
    })

    it('adds media()/mediaBody() to the ContentrainClient interface when hasMedia is true', () => {
      const out = emitTypes([COLLECTION], true)
      expect(out).toContain('export interface ContentrainClient {')
      expect(out).toContain('  media(value: string, baseOverride?: string): string')
      expect(out).toContain('  mediaBody(markdown: string, baseOverride?: string): string')
    })
  })
})

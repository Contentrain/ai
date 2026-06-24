import { describe, it, expect } from 'vitest'
import type { ModelDefinition } from '@contentrain/types'
import { emitRuntimeModule, emitCjsWrapper } from '../../src/generator/runtime-emitter.js'
import { emitTypes } from '../../src/generator/type-emitter.js'

const COLLECTION: ModelDefinition = {
  id: 'blog-post', name: 'Blog Post', kind: 'collection', domain: 'blog', i18n: true,
}
const DATA = [{ fileName: 'blog-post.en.mjs', content: 'export default []' }]

describe('media() emission', () => {
  describe('emitRuntimeModule', () => {
    it('emits a media() resolver with a trailing-slash-trimmed base when cdnBaseUrl is set', () => {
      const out = emitRuntimeModule([COLLECTION], DATA, 'en', 'https://cdn.test/api/cdn/v1/proj/')
      expect(out).toContain('const _mediaBase = "https://cdn.test/api/cdn/v1/proj"')
      expect(out).toContain('export function media(value)')
      expect(out).toContain("return _mediaBase + '/' + value")
    })

    it('omits media() and _mediaBase when no base is given', () => {
      const out = emitRuntimeModule([COLLECTION], DATA, 'en')
      expect(out).not.toContain('export function media(')
      expect(out).not.toContain('_mediaBase')
    })
  })

  describe('emitCjsWrapper', () => {
    it('re-exports media when hasMedia is true', () => {
      expect(emitCjsWrapper([COLLECTION], true)).toContain('module.exports.media = m.media')
    })

    it('does not re-export media by default', () => {
      expect(emitCjsWrapper([COLLECTION])).not.toContain('m.media')
    })
  })

  describe('emitTypes', () => {
    it('declares media() when hasMedia is true', () => {
      expect(emitTypes([], true)).toContain('export declare function media(value: string): string')
    })

    it('omits the media() declaration by default', () => {
      expect(emitTypes([])).not.toContain('function media(')
    })
  })
})

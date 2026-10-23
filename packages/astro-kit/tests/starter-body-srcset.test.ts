import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const STARTER = join(import.meta.dirname, '..', '..', '..', 'templates', 'astro-starter')

// The starter's own file, compiled here (as `starter-body-tables.test.ts` does): it imports nothing, so it runs as it is.
const source = await readFile(join(STARTER, 'src', 'lib', 'srcset.ts'), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const loaded = { exports: {} as { sameFile: (src: string, srcset: string) => boolean } }
// eslint-disable-next-line no-new-func -- the starter's module, read from its file
new Function('module', 'exports', compiled)(loaded, loaded.exports)
const { sameFile } = loaded.exports

describe('a source srcset is kept only when every candidate is src\'s own file', () => {
  it('WordPress sizes of one file: -WxH and -scaled', () => {
    expect(sameFile('https://example.com/wp-content/uploads/a.jpg', 'https://example.com/wp-content/uploads/a-300x200.jpg 300w, https://example.com/wp-content/uploads/a-scaled.jpg 2560w')).toBe(true)
  })

  it('an image plugin\'s second extension (.jpg.webp, .png.avif) is the same file in another size', () => {
    const base = 'https://example.com/wp-content/smush-webp/2025/08/quantity-surveyor'
    expect(sameFile(`${base}.jpg.webp`, `${base}.jpg.webp 315w, ${base}-300x130.jpg.webp 300w`)).toBe(true)
    expect(sameFile(`${base}-1024x442.png.avif`, `${base}-300x130.png.avif 300w, ${base}-scaled.png.avif 2560w`)).toBe(true)
  })

  it('another picture, another format of the name, or another host is not: the set goes', () => {
    const at = 'https://example.com/wp-content/uploads/'
    expect(sameFile(`${at}a.jpg.webp`, `${at}b-300x200.jpg.webp 300w`)).toBe(false)
    expect(sameFile(`${at}a.jpg.webp`, `${at}a-300x200.png.webp 300w`)).toBe(false)
    expect(sameFile(`${at}a.jpg`, 'https://cdn.example.net/wp-content/uploads/a-300x200.jpg 300w')).toBe(false)
    expect(sameFile(`${at}a.jpg`, '')).toBe(false)
  })
})

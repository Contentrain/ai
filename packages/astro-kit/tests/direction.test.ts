import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

// The starter's <html dir>: the kit's logical utilities and mirrored arrows read it. The starter is a project of its
// own (its tsconfig extends astro, which the monorepo does not install there), so the module is compiled here.
const source = await readFile(join(import.meta.dirname, '..', '..', '..', 'templates', 'astro-starter', 'src', 'lib', 'direction.ts'), 'utf8')
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
const { textDirection } = await import(`data:text/javascript,${encodeURIComponent(js)}`) as { textDirection: (lang: string) => 'rtl' | 'ltr' }

describe('templates/astro-starter textDirection', () => {
  it.each([
    ['ar', 'rtl'], ['ar-EG', 'rtl'], ['he', 'rtl'], ['iw', 'rtl'], ['fa', 'rtl'], ['fa-IR', 'rtl'], ['ur', 'rtl'], ['ps', 'rtl'],
    ['ckb', 'rtl'], ['dv', 'rtl'], ['yi', 'rtl'], ['ug', 'rtl'], ['sd', 'rtl'],
    ['ku-Arab', 'rtl'], ['pa-Arab', 'rtl'], ['az-arab-IR', 'rtl'], ['jrb-Hebr', 'rtl'], ['ZH_hebr', 'rtl'],
    ['en', 'ltr'], ['en-US', 'ltr'], ['tr', 'ltr'], ['ja', 'ltr'], ['zh-Hant', 'ltr'], ['ru', 'ltr'], ['hi', 'ltr'],
    ['ku', 'ltr'], ['ku-Latn', 'ltr'], ['pa', 'ltr'], ['arn', 'ltr'], ['', 'ltr'],
  ] as const)('%s → %s', (lang, dir) => {
    expect(textDirection(lang)).toBe(dir)
  })
})

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The heading hooks a site's theme or a design direction sets: `--font-heading` (a heading face of its own) and
 * `--tracking-heading` (the headings' letter spacing). They live in the starter's stylesheet, so the kit's markup does
 * not change. Unset (the default), a heading draws exactly as before.
 */
const CSS = join(import.meta.dirname, '..', '..', '..', 'templates', 'astro-starter', 'src', 'styles', 'global.css')

describe('the heading hooks', () => {
  it('are not set by default, so a heading keeps the face it inherits and the track its classes draw', async () => {
    const theme = /@theme \{([\s\S]*?)\n\}/.exec(await readFile(CSS, 'utf8'))![1]!.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(theme).not.toMatch(/--font-heading\s*:/)
    expect(theme).not.toMatch(/--tracking-heading\s*:/)
  })

  it('give every heading the heading face, and the heading track to every heading drawn with the tight one', async () => {
    const css = await readFile(CSS, 'utf8')
    // In the base layer: a utility on a heading (a font-* class) still wins over it.
    const base = /@layer base \{([\s\S]*?)\n\}/.exec(css)![1]!
    expect(base).toMatch(/:where\(h1, h2, h3, h4, h5, h6\) \{\s*font-family: var\(--font-heading\);\s*\}/)
    // In the utilities layer and more specific than `.tracking-tight`, so it replaces that utility's value on headings.
    const utilities = /@layer utilities \{([\s\S]*?)\n\}/.exec(css)![1]!
    expect(utilities).toContain(':is(h1, h2, h3, h4, h5, h6).tracking-tight { letter-spacing: var(--tracking-heading, var(--tracking-tight)); }')
  })

  it('fall to no tracking where the tracking tokens do (joined and clustered scripts, CJK)', async () => {
    const css = await readFile(CSS, 'utf8')
    const scripts = /:where\(:lang\(ar\)[^{]*\{([^}]*)\}/.exec(css)![1]!
    expect(scripts).toContain('--tracking-tight: 0;')
    expect(scripts).toContain('--tracking-heading: 0;')
  })
})

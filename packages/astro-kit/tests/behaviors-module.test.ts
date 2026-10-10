import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const KIT = join(import.meta.dirname, '..')
const read = (path: string) => readFile(join(KIT, path), 'utf8')

/**
 * The behavior islands' module runs on content (the source site's own markup). What it may never do is checked on its
 * source, so a later edit cannot slip one in (t13's PR-E checklist §4).
 */
describe('behavior islands: the module', () => {
  it('writes text only through textContent: no innerHTML family, no eval, no Function, no network, no navigation', async () => {
    const code = (await read('components/_shared/behaviors.ts')).replace(/^\s*\/\/.*$/gm, '')
    for (const banned of [/\binnerHTML\b/, /\bouterHTML\b/, /insertAdjacentHTML/, /\bcreateContextualFragment\b/, /document\.write/, /\beval\s*\(/, /\bnew Function\b/, /\bFunction\s*\(/, /\bfetch\s*\(/, /XMLHttpRequest/, /\blocation\b/, /\bsetTimeout\s*\(\s*['"`]/, /\bimport\s*\(/])
      expect(code, String(banned)).not.toMatch(banned)
  })

  it('reads only data-cr-* the component prints, ARIA, details and hidden: every selector is scoped to the island root', async () => {
    const code = (await read('components/_shared/behaviors.ts')).replace(/^\s*\/\/.*$/gm, '')
    // The one document-wide query finds the island roots; everything else goes through `within`/`target` on a root.
    expect(code.match(/document\.querySelector/g) ?? []).toHaveLength(0)
    expect(code).toContain("scope.querySelectorAll<HTMLElement>('[data-cr-behavior]')")
    // Wired once: a second call skips a ready root.
    expect(code).toContain('root.dataset.crReady !== undefined')
    // A root nested in another root came with the markup (a spoofed island): never wired.
    expect(code).toContain("root.parentElement?.closest('[data-cr-behavior]')")
    // A counter changes only its digits' text node, never the item's markup (icons, suffix spans).
    expect(code).toContain('node.data = ')
    expect(code).not.toMatch(/item\.textContent\s*=/)
    // In-page links look in the island first.
    expect(code).toContain('target(root, id) ?? ')
  })

  it('the component prints the data-cr-* attributes from its props only, and loads the module only where it is used', async () => {
    const astro = await read('components/behavior/Behavior.astro')
    expect(astro).toContain("import { initBehaviors } from '../_shared/behaviors'")
    expect(astro).not.toMatch(/is:inline/)
    expect([...astro.matchAll(/data-cr-[a-z]+=\{/g)].map(m => m[0])).toEqual(['data-cr-behavior={', 'data-cr-items={', 'data-cr-title={', 'data-cr-panel={', 'data-cr-fact={', 'data-cr-prev={', 'data-cr-next={', 'data-cr-close={'])
  })
})

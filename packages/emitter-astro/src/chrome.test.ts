import { describe, it, expect } from 'vitest'
import type { ProjectIR } from '@contentrain/types'
import { MIGRATION_CONTRACT_VERSION } from '@contentrain/types'
import { emitAstroProject, balanceWarning, checkBalance } from './index'

const HEADER = '<header id="masthead"><a href="/">@@site_name@@</a><nav><ul><li><a href="/blog">Blog</a></li></ul></nav></header>'
const FOOTER = '<footer id="colophon"><p>© @@site_name@@</p></footer>'
const SHELL = '<div class="site"><main><article><h1>@@title@@</h1><div class="entry-content"><!--@@body@@--></div></article></main></div>'

function ir(families: ProjectIR['families']): ProjectIR {
  return {
    version: MIGRATION_CONTRACT_VERSION,
    site: { url: 'https://example.com', locales: ['en'] },
    routes: [{ id: 'r', pattern: '/', kind: 'front', family: families[0]!.id }],
    families,
    queries: [],
    tokens: {},
    css_default: 'purge_set',
    viewport_strategy: 'responsive',
  }
}

const family = (id: string, chrome: NonNullable<ProjectIR['families'][number]['chrome']>) => ({
  id,
  kind: 'single' as const,
  chrome,
  css: { strategy: 'purge_set' as const, files: [] },
})

describe('balance check', () => {
  it('passes a fragment that closes what it opens', () => {
    expect(balanceWarning(HEADER)).toBeNull()
    expect(balanceWarning(SHELL)).toBeNull()
  })

  it('names the tags left open when chrome is split mid-element', () => {
    const report = checkBalance('<div class="site"><header>H</header><main>')
    expect(report.unclosed).toEqual(['main', 'div'])
    expect(report.unopened).toEqual([])
    expect(balanceWarning('<div class="site"><header>H</header><main>')).toBe('never closed: main, div')
  })

  it('names the tags closed but never opened — the second half of a split', () => {
    expect(balanceWarning('</main></div>')).toBe('closed but never opened: main, div')
  })

  it('tolerates void elements and the tags HTML closes for you', () => {
    expect(balanceWarning('<ul><li>a<li>b</ul><img src="x"><br><input value="y">')).toBeNull()
    expect(balanceWarning('<table><tr><td>a<td>b</table>')).toBeNull()
  })

  it('does not read markup inside comments, scripts or attribute values', () => {
    expect(balanceWarning('<div><!-- <span> --></div>')).toBeNull()
    expect(balanceWarning('<div><script>if (a < b) { document.write("<p>") }</script></div>')).toBeNull()
    expect(balanceWarning('<div data-tpl="a > b"><span>x</span></div>')).toBeNull()
    expect(balanceWarning('<div><!--@@if:feat@@--><span>x</span><!--@@/if@@--></div>')).toBeNull()
  })

  it('accepts a self-closing element written the XML way', () => {
    expect(balanceWarning('<div><svg /><span>x</span></div>')).toBeNull()
  })
})

describe('header/footer chrome components', () => {
  it('lifts the regions into components and renders them around the body fragment', () => {
    const { files, warnings } = emitAstroProject({
      ir: ir([
        family('f-article', [
          { id: 'h', position: 'header', html: HEADER },
          { id: 'b', position: 'body', html: SHELL },
          { id: 'f', position: 'footer', html: FOOTER },
        ]),
      ]),
    })

    expect(files['src/components/SiteHeader.astro']).toContain("import chunk from '../data/components/SiteHeader.json'")
    expect(files['src/components/SiteHeader.astro']).toContain('renderTemplate(chunk.html, marks)')
    expect(JSON.parse(files['src/data/components/SiteHeader.json']!)).toEqual({ html: HEADER })
    expect(JSON.parse(files['src/data/components/SiteFooter.json']!)).toEqual({ html: FOOTER })

    const layout = files['src/layouts/FArticle.astro']!
    expect(layout).toContain("import SiteHeader from '../components/SiteHeader.astro'")
    expect(layout).toContain("import SiteFooter from '../components/SiteFooter.astro'")
    const header = layout.indexOf('<SiteHeader marks={marks} />')
    const fragment = layout.indexOf('<Fragment set:html={html} />')
    const footer = layout.indexOf('<SiteFooter marks={marks} />')
    expect(header).toBeGreaterThan(-1)
    expect(header).toBeLessThan(fragment)
    expect(fragment).toBeLessThan(footer)

    // The lifted markup must leave the blob — otherwise the page renders it twice.
    const chrome = JSON.parse(files['src/data/chrome/f-article.json']!) as { body: string }
    expect(chrome.body).toBe(SHELL)
    expect(chrome.body).not.toContain('masthead')
    expect(warnings).toEqual([])
  })

  it('emits one component for families that carry the same header', () => {
    const { files } = emitAstroProject({
      ir: ir([
        family('f-a', [
          { id: 'h', position: 'header', html: HEADER },
          { id: 'b', position: 'body', html: SHELL },
        ]),
        family('f-b', [
          { id: 'h', position: 'header', html: HEADER },
          { id: 'b', position: 'body', html: SHELL },
        ]),
      ]),
    })

    const components = Object.keys(files).filter((p) => p.startsWith('src/components/'))
    expect(components).toEqual(['src/components/SiteHeader.astro'])
    expect(files['src/layouts/FA.astro']).toContain("import SiteHeader from '../components/SiteHeader.astro'")
    expect(files['src/layouts/FB.astro']).toContain("import SiteHeader from '../components/SiteHeader.astro'")
  })

  it('never swaps one family’s header for another’s when the names collide', () => {
    const other = '<header id="masthead"><a href="/shop">Shop</a></header>'
    const { files, warnings } = emitAstroProject({
      ir: ir([
        family('f-a', [{ id: 'h', position: 'header', html: HEADER }]),
        family('f-b', [{ id: 'h', position: 'header', html: other }]),
      ]),
    })

    expect(JSON.parse(files['src/data/components/SiteHeader.json']!)).toEqual({ html: HEADER })
    expect(JSON.parse(files['src/data/components/SiteHeader2.json']!)).toEqual({ html: other })
    expect(files['src/layouts/FB.astro']).toContain("import SiteHeader2 from '../components/SiteHeader2.astro'")
    expect(warnings).toContain(
      'family f-b: header chrome: component name "SiteHeader" is already used by different markup — emitted as "SiteHeader2"',
    )
  })

  it('honours a producer-chosen component name', () => {
    const { files } = emitAstroProject({
      ir: ir([
        family('f-a', [{ id: 'h', position: 'header', component: 'shop-header', html: HEADER }]),
      ]),
    })
    expect(files['src/components/ShopHeader.astro']).toBeDefined()
    expect(files['src/layouts/FA.astro']).toContain("import ShopHeader from '../components/ShopHeader.astro'")
  })

  it('makes an importable identifier out of a name that starts with a digit', () => {
    const { files } = emitAstroProject({
      ir: ir([family('f-a', [{ id: 'h', position: 'header', component: '2col-header', html: HEADER }])]),
    })
    expect(files['src/components/Chrome2colHeader.astro']).toBeDefined()
    expect(files['src/layouts/FA.astro']).toContain("import Chrome2colHeader from '../components/Chrome2colHeader.astro'")
  })

  it('warns when a lifted region is not balanced instead of shipping a repaired page', () => {
    const { warnings } = emitAstroProject({
      ir: ir([
        family('f-a', [
          { id: 'h', position: 'header', html: '<div class="wrap"><header>H</header>' },
          { id: 'b', position: 'body', html: SHELL },
        ]),
      ]),
    })
    expect(warnings).toContain(
      'family f-a: header chrome is not balanced (never closed: div) — a lifted region must close what it opens; keep it in the body chunk',
    )
  })

  it('warns when the content marker was left in a lifted region', () => {
    const { warnings } = emitAstroProject({
      ir: ir([
        family('f-a', [
          { id: 'f', position: 'footer', html: '<footer><!--@@body@@--></footer>' },
          { id: 'b', position: 'body', html: SHELL },
        ]),
      ]),
    })
    expect(warnings.some((w) => w.includes('footer chrome carries <!--@@body@@-->'))).toBe(true)
  })

  it('warns when the body blob itself is unbalanced', () => {
    const { warnings } = emitAstroProject({
      ir: ir([
        family('f-a', [{ id: 'b', position: 'body', html: '<div class="site"><!--@@body@@-->' }]),
      ]),
    })
    expect(warnings).toContain(
      'family f-a: body chrome is not balanced (never closed: div) — the browser will repair it and the page loses its layout',
    )
  })

  it('leaves a family without lifted regions exactly as it was', () => {
    const { files, warnings } = emitAstroProject({
      ir: ir([family('f-a', [{ id: 'b', position: 'body', html: SHELL }])]),
    })
    const layout = files['src/layouts/FA.astro']!
    expect(layout).not.toContain('../components/')
    expect(layout).toContain('<Fragment set:html={html} />')
    expect(Object.keys(files).some((p) => p.startsWith('src/data/components/'))).toBe(false)
    expect(warnings).toEqual([])
  })
})

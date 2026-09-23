import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach, vi } from 'vitest'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ProjectIR } from '@contentrain/types'
import { MIGRATION_CONTRACT_VERSION } from '@contentrain/types'
import { emitAstroProject } from './index'

// The image pass ships as source text, so — like runtime.test.ts — this suite
// writes the EMITTED files to disk and imports them. optimize-images.ts gets
// its `astro:assets` import swapped for a recording stub; everything else is
// the code a migrated site runs.

const TMP = join(dirname(fileURLToPath(import.meta.url)), '..', '.vitest-tmp-images')

const ir: ProjectIR = {
  version: MIGRATION_CONTRACT_VERSION,
  site: { url: 'https://example.com' },
  routes: [],
  families: [{ id: 'single', chrome: [{ id: 'b', position: 'body', html: '<main><!--@@body@@--></main>' }], css: { strategy: 'localcss' } }],
  css_default: 'purge_set',
} as ProjectIR

const runtime = { base_url: 'https://studio.contentrain.io', project_id: 'p1' }

type Optimizer = (src: string, hints: { width?: number, height?: number }) => Promise<{ src: string, srcset?: string, width?: number, height?: number } | null>
interface ImagesLib { rewriteImages: (html: string, optimize: Optimizer, options: { sizes: string }) => Promise<string> }
interface OptimizeLib { optimizeHtmlImages: (html: string) => Promise<string> }

let lib: ImagesLib
let optimizeLib: OptimizeLib
let getImageCalls: Array<Record<string, unknown>> = []

beforeAll(async () => {
  const { files } = emitAstroProject({ ir, runtime, options: { images: { remotePatterns: [{ hostname: 'cdn.example.org', pathname: '/media' }] } } })
  await mkdir(TMP, { recursive: true })
  await writeFile(join(TMP, 'images.ts'), files['src/lib/images.ts']!, 'utf8')
  const optimize = files['src/lib/optimize-images.ts']!
    .replace(`import { getImage } from 'astro:assets'`, `import { getImage } from './astro-assets-stub'`)
  await writeFile(join(TMP, 'optimize-images.ts'), optimize, 'utf8')
  await writeFile(join(TMP, 'astro-assets-stub.ts'), `
export const calls: Array<Record<string, unknown>> = []
export async function getImage(options: Record<string, unknown>) {
  calls.push(options)
  return {
    src: '/_astro/opt.webp',
    srcSet: { attribute: '/_astro/opt-480.webp 480w, /_astro/opt-768.webp 768w' },
    attributes: { width: 1200, height: 800 },
  }
}
`, 'utf8')
  lib = await import(join(TMP, 'images.ts')) as ImagesLib
  optimizeLib = await import(join(TMP, 'optimize-images.ts')) as OptimizeLib
  const stub = await import(join(TMP, 'astro-assets-stub.ts')) as { calls: Array<Record<string, unknown>> }
  getImageCalls = stub.calls
})

afterAll(async () => {
  await rm(TMP, { recursive: true, force: true })
})

const optimizer = (accept: (src: string) => boolean): Optimizer => async (src) =>
  accept(src) ? { src: `/_astro/${src.split('/').pop()}.webp`, srcset: '/_astro/a-480.webp 480w', width: 1200, height: 800 } : null

// An optimized image narrower than every srcset width: a src, no srcset.
const narrow: Optimizer = async () => ({ src: '/_astro/small.webp', width: 300, height: 200 })

describe('rewriteImages (emitted src/lib/images.ts)', () => {
  it('makes the first image eager with high priority and the rest lazy, all async', async () => {
    const out = await lib.rewriteImages('<p><img src="/a.jpg"></p><img src="/b.jpg" alt="b">', optimizer(() => false), { sizes: '100vw' })
    expect(out).toBe('<p><img src="/a.jpg" loading="eager" fetchpriority="high" decoding="async"></p><img src="/b.jpg" alt="b" loading="lazy" decoding="async">')
  })

  it('replaces src, srcset and size for images the optimizer accepts, keeping alt and class', async () => {
    const out = await lib.rewriteImages('<img class="wp-image-7" src="https://cdn.x/p/photo.jpg" srcset="https://cdn.x/p/photo-300.jpg 300w" alt="A &amp; B">', optimizer(() => true), { sizes: '(max-width: 768px) 100vw, 768px' })
    expect(out).toBe('<img class="wp-image-7" src="/_astro/photo.jpg.webp" srcset="/_astro/a-480.webp 480w" alt="A &amp; B" loading="eager" fetchpriority="high" decoding="async" sizes="(max-width: 768px) 100vw, 768px" width="1200" height="800">')
  })

  it('respects existing loading, decoding, sizes and dimensions', async () => {
    const out = await lib.rewriteImages('<img src="https://cdn.x/a.jpg" loading="lazy" decoding="sync" sizes="50vw" width="600" height="400">', optimizer(() => true), { sizes: '100vw' })
    expect(out).toContain('loading="lazy"')
    expect(out).not.toContain('fetchpriority')
    expect(out).toContain('decoding="sync"')
    expect(out).toContain('sizes="50vw"')
    expect(out).toContain('width="600" height="400"')
    expect(out).not.toContain('width="1200"')
  })

  it('never sends SVG, GIF, data: URIs or data-cr-keep images to the optimizer', async () => {
    const seen: string[] = []
    const spy: Optimizer = async (src) => { seen.push(src); return null }
    await lib.rewriteImages('<img src="/logo.svg"><img src="/anim.gif?v=2"><img src="data:image/png;base64,AAA"><img src="/x.jpg" data-cr-keep>', spy, { sizes: '100vw' })
    expect(seen).toEqual([])
  })

  it('keeps the original image when the optimizer throws', async () => {
    const out = await lib.rewriteImages('<img src="https://cdn.x/a.jpg" alt="a">', async () => { throw new Error('fetch failed') }, { sizes: '100vw' })
    expect(out).toBe('<img src="https://cdn.x/a.jpg" alt="a" loading="eager" fetchpriority="high" decoding="async">')
  })

  it('reads a tag whose quoted attribute holds ">", and keeps the rest of the html intact', async () => {
    const out = await lib.rewriteImages('<p>x</p><img alt="a > b" src="/a.jpg"><p>y</p>', optimizer(() => false), { sizes: '100vw' })
    expect(out).toBe('<p>x</p><img alt="a > b" src="/a.jpg" loading="eager" fetchpriority="high" decoding="async"><p>y</p>')
  })

  it('decodes entities in src before optimizing, and writes source values back as they were', async () => {
    const seen: string[] = []
    const spy: Optimizer = async (src) => { seen.push(src); return null }
    const html = `<img src="https://i0.wp.com/x.com/p.jpg?resize=800%2C600&amp;ssl=1" alt='say "hi" &amp; wave' title="&nbsp;x">`
    const out = await lib.rewriteImages(html, spy, { sizes: '100vw' })
    expect(seen).toEqual(['https://i0.wp.com/x.com/p.jpg?resize=800%2C600&ssl=1'])
    expect(out).toBe('<img src="https://i0.wp.com/x.com/p.jpg?resize=800%2C600&amp;ssl=1" alt="say &quot;hi&quot; &amp; wave" title="&nbsp;x" loading="eager" fetchpriority="high" decoding="async">')
  })

  it("drops the source's srcset and sizes when the optimized image has no srcset of its own", async () => {
    const out = await lib.rewriteImages('<img src="https://cdn.x/s.jpg" srcset="https://cdn.x/s-150.jpg 150w, https://cdn.x/s.jpg 300w" sizes="(max-width: 300px) 100vw, 300px">', narrow, { sizes: '100vw' })
    expect(out).toBe('<img src="/_astro/small.webp" loading="eager" fetchpriority="high" decoding="async" width="300" height="200">')
  })

  it('leaves html without images untouched', async () => {
    expect(await lib.rewriteImages('<p>no pictures</p>', optimizer(() => true), { sizes: '100vw' })).toBe('<p>no pictures</p>')
  })
})

// What the reachability check sees, per URL. Anything not listed answers with an image.
const answers = new Map<string, (method: string) => Response | Promise<Response>>()
const fetchCalls: Array<[string, string]> = []
const image = () => new Response('x', { status: 200, headers: { 'content-type': 'image/jpeg' } })

describe('optimizeHtmlImages (emitted src/lib/optimize-images.ts)', () => {
  beforeEach(() => {
    answers.clear()
    fetchCalls.length = 0
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: { method?: string }) => {
      const method = init?.method ?? 'GET'
      fetchCalls.push([method, url])
      return (answers.get(url) ?? image)(method)
    }))
  })
  afterEach(() => { vi.unstubAllGlobals() })

  it('keeps the original image when the host does not answer 200 with an image — getImage never sees it, so astro build cannot fail on it', async () => {
    const calls = getImageCalls
    calls.length = 0
    const base = 'https://studio.contentrain.io/api/cdn/v1/p1/media/'
    answers.set(`${base}404.jpg`, () => new Response('', { status: 404 }))
    answers.set(`${base}page.jpg`, () => new Response('<html>', { status: 200, headers: { 'content-type': 'text/html' } }))
    answers.set(`${base}slow.jpg`, () => Promise.reject(new DOMException('The operation was aborted due to timeout', 'TimeoutError')))
    answers.set(`${base}ok.jpg`, image)
    const out = await optimizeLib.optimizeHtmlImages(['404', 'page', 'slow', 'ok'].map((n) => `<img src="${base}${n}.jpg" width="800" height="600">`).join(''))
    expect(calls.map((c) => c.src)).toEqual([`${base}ok.jpg`])
    for (const n of ['404', 'page', 'slow']) expect(out).toContain(`src="${base}${n}.jpg"`)
    expect(out).toContain('src="/_astro/opt.webp"')
    // A timed-out HEAD is asked once more with GET before giving up.
    expect(fetchCalls.filter(([, url]) => url === `${base}slow.jpg`).map(([m]) => m)).toEqual(['HEAD', 'GET'])
  })

  it('asks with GET when a host refuses HEAD, and checks each URL once per build', async () => {
    const calls = getImageCalls
    calls.length = 0
    const src = 'https://cdn.example.org/media/nohead.jpg'
    answers.set(src, (method) => (method === 'HEAD' ? new Response('', { status: 405 }) : image()))
    await optimizeLib.optimizeHtmlImages(`<img src="${src}"><img src="${src}">`)
    expect(fetchCalls.map(([m]) => m)).toEqual(['HEAD', 'GET'])
    expect(calls).toHaveLength(2)
  })

  it('optimizes images on the runtime host and on configured patterns only', async () => {
    const calls = getImageCalls
    calls.length = 0
    const out = await optimizeLib.optimizeHtmlImages([
      '<img src="https://studio.contentrain.io/api/cdn/v1/p1/media/a.jpg">',
      '<img src="https://cdn.example.org/media/b.jpg" width="800" height="600">',
      '<img src="https://cdn.example.org/other/c.jpg">',
      '<img src="https://elsewhere.com/d.jpg">',
      '<img src="/wp-content/uploads/e.jpg">',
    ].join(''))
    expect(calls.map(c => c.src)).toEqual([
      'https://studio.contentrain.io/api/cdn/v1/p1/media/a.jpg',
      'https://cdn.example.org/media/b.jpg',
    ])
    expect(calls[0]).toEqual({ src: 'https://studio.contentrain.io/api/cdn/v1/p1/media/a.jpg', format: 'webp', inferSize: true, widths: [480, 768, 1024, 1600] })
    // Known size: no inference, and no srcset width above the width the HTML declares.
    expect(calls[1]).toEqual({ src: 'https://cdn.example.org/media/b.jpg', format: 'webp', width: 800, height: 600, widths: [480, 768] })
    expect(out.match(/\/_astro\/opt\.webp/g)).toHaveLength(2)
    expect(out).toContain('src="https://elsewhere.com/d.jpg" loading="lazy" decoding="async"')
  })
})

describe('emitted project', () => {
  it('allows the runtime host and configured patterns in astro.config, adds sharp, and wires layouts', () => {
    const { files } = emitAstroProject({ ir, runtime, options: { images: { remotePatterns: [{ hostname: 'cdn.example.org', pathname: '/media' }] } } })
    expect(files['astro.config.mjs']).toContain(`image: { remotePatterns: [{ protocol: "https", hostname: "cdn.example.org", pathname: "/media/**" }, { protocol: "https", hostname: "studio.contentrain.io" }] },`)
    expect(JSON.parse(files['package.json']!).dependencies.sharp).toBeDefined()
    const layout = files['src/layouts/Single.astro']!
    expect(layout).toContain(`import { optimizeHtmlImages } from '../lib/optimize-images'`)
    expect(layout).toContain('const content = await optimizeHtmlImages(')
  })

  it('without a runtime or patterns there is no remote config, but the lazy/async pass still runs', () => {
    const { files } = emitAstroProject({ ir })
    expect(files['astro.config.mjs']).not.toContain('remotePatterns')
    expect(files['src/lib/optimize-images.ts']).toContain('const PATTERNS: Array<{ protocol: string; hostname: string; pathname?: string }> = []')
    expect(files['src/layouts/Single.astro']).toContain('optimizeHtmlImages')
  })

  it('images: { enabled: false } emits no image pass at all', () => {
    const { files } = emitAstroProject({ ir, runtime, options: { images: { enabled: false } } })
    expect(files['src/lib/images.ts']).toBeUndefined()
    expect(files['src/lib/optimize-images.ts']).toBeUndefined()
    expect(files['astro.config.mjs']).not.toContain('remotePatterns')
    expect(files['src/layouts/Single.astro']).not.toContain('optimizeHtmlImages')
    expect(JSON.parse(files['package.json']!).dependencies.sharp).toBeUndefined()
  })
})

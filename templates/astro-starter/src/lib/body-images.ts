// Images inside rich text. A body is HTML a person (or WordPress) wrote, so its `<img>` cannot be the Image
// component: it is rewritten here, at build time, the way KitImage treats the files under public/. A raster file
// there (png, jpg) is resized into a webp srcset up to its own width, its width and height are written when the tag
// has none (no layout shift), and WordPress's own srcset of sizes of the same file is replaced by it. Anything else
// stays as written: a remote image, a gif (may be animated), a vector, a file that is not in public/.

import type { ImageMetadata } from 'astro'
import { getImage } from 'astro:assets'

const LOCAL = import.meta.glob<ImageMetadata>('/public/**/*.{jpeg,jpg,png,JPEG,JPG,PNG}', { import: 'default' })
const IMG = /<img\b[^>]*>/gi
const STEPS = [320, 640, 960, 1280, 1600, 1920, 2560]
const widthsUpTo = (max: number) => [...STEPS.filter(step => step < max), max]

const attr = (name: string) => new RegExp(`(\\s${name}\\s*=\\s*)(?:"([^"]*)"|'([^']*)')`, 'i')
const read = (tag: string, name: string) => { const m = attr(name).exec(tag); return m ? (m[2] ?? m[3]) : undefined }
/** The tag with `name` set to `value`: replaced where present, added before the tag's end where not. */
function write(tag: string, name: string, value: string): string {
  const quoted = `"${value.replaceAll('&', '&amp;').replaceAll('"', '&quot;')}"`
  return attr(name).test(tag) ? tag.replace(attr(name), `$1${quoted}`) : tag.replace(/\s*\/?>$/, end => ` ${name}=${quoted}${end}`)
}

async function optimize(tag: string): Promise<string> {
  const src = read(tag, 'src')?.replaceAll('&amp;', '&').replaceAll('&#038;', '&')
  if (!src?.startsWith('/') || src.startsWith('//')) return tag
  let file: string
  try { file = decodeURI(src.split(/[?#]/)[0]!) } catch { return tag }
  const load = LOCAL[`/public${file}`]
  if (!load) return tag
  try {
    const local = await load()
    const shown = Number(read(tag, 'width')) || local.width
    const image = await getImage({ src: local, widths: widthsUpTo(local.width), format: 'webp' })
    let next = write(tag, 'src', image.src)
    next = write(next, 'srcset', image.srcSet.attribute)
    if (!read(tag, 'sizes') || /^auto\b/.test(read(tag, 'sizes')!)) next = write(next, 'sizes', `(max-width: ${shown}px) 100vw, ${shown}px`)
    // WordPress writes the size it chose. Only what is missing is written: the other side follows the file's ratio,
    // and a tag with neither takes the file's own size.
    const given = { width: Number(read(tag, 'width')) || 0, height: Number(read(tag, 'height')) || 0 }
    if (!given.width || !given.height) {
      const width = given.width || (given.height ? Math.round(given.height * local.width / local.height) : local.width)
      const height = given.height || Math.round(width * local.height / local.width)
      if (!given.width) next = write(next, 'width', String(width))
      if (!given.height) next = write(next, 'height', String(height))
    }
    if (read(tag, 'loading') === undefined) next = write(next, 'loading', 'lazy')
    if (read(tag, 'decoding') === undefined) next = write(next, 'decoding', 'async')
    return next
  }
  catch {
    // An image that cannot be processed (a corrupt file) stays as written: the page still builds and shows it.
    return tag
  }
}

/** The HTML with every local raster `<img>` served as a webp srcset of its file. */
export async function optimizedImages(html: string): Promise<string> {
  const tags = [...new Set(html.match(IMG) ?? [])]
  if (!tags.length) return html
  const done = new Map(await Promise.all(tags.map(async tag => [tag, await optimize(tag)] as const)))
  return html.replace(IMG, tag => done.get(tag) ?? tag)
}

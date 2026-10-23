// Images inside rich text. A body is HTML a person (or WordPress) wrote, so its `<img>` cannot be the Image
// component: it is rewritten here, at build time, the way KitImage treats images. The move is never less responsive
// than the source:
//
//  - a raster file under public/ (avif, jpg, png, tif, webp) is resized into a webp srcset, up to twice the width the
//    tag shows it at (never past the file's own), and WordPress's own srcset of sizes of the same file is replaced;
//  - a raster image on a media host the site allows (astro.config `image.remotePatterns`, Contentrain Studio) is resized
//    the same way when its size is known (the tag's, else the one the migration measured);
//  - any other image (a remote one left where it was, a gif, which may be animated, a file not in public/) keeps the
//    source's srcset only when every candidate is the same file as `src` in another size: a set that names another
//    picture (an edit changed `src`, the set stayed) would show the old one, so it goes;
//  - `sizes` never stays without a `srcset`, and `sizes="auto"` only with `loading="lazy"`.
//
// The tag's width, height and loading are kept (WordPress writes the size it chose and leaves its first image eager);
// only what is missing is written. Under a `base` a root address (`/media/a.svg`) is put in the site's directory, where
// public/ is served.

import type { ImageMetadata } from 'astro'
import { getImage, imageConfig } from 'astro:assets'
import { isRemoteAllowed } from 'astro/assets/utils'
import { widthCap, widthsUpTo } from '../components/kit/_shared/image-widths'
import { servedPath, withoutBase } from './base'
import { mediaSize } from './media'
import { sameFile } from './srcset'

const LOCAL = import.meta.glob<ImageMetadata>('/public/**/*.{avif,jpeg,jpg,png,tif,tiff,webp,AVIF,JPEG,JPG,PNG,TIF,TIFF,WEBP}', { import: 'default' })
const IMG = /<img\b[^>]*>/gi
/** A raster file the build resizes (the local glob's formats): a vector or a gif, which may be animated, is not one. */
const RASTER = /\.(?:avif|jpe?g|png|tiff?|webp)$/i
// The site's `image` config, as the check Astro itself runs reads it (its types differ only in optional keys).
const allowed = imageConfig as Parameters<typeof isRemoteAllowed>[1]

const attr = (name: string) => new RegExp(`(\\s${name}\\s*=\\s*)(?:"([^"]*)"|'([^']*)')`, 'i')
const read = (tag: string, name: string) => { const m = attr(name).exec(tag); return m ? (m[2] ?? m[3]) : undefined }
/** The tag with `name` set to `value`: replaced where present, added before the tag's end where not. */
function write(tag: string, name: string, value: string): string {
  const quoted = `"${value.replaceAll('&', '&amp;').replaceAll('"', '&quot;')}"`
  return attr(name).test(tag) ? tag.replace(attr(name), `$1${quoted}`) : tag.replace(/\s*\/?>$/, end => ` ${name}=${quoted}${end}`)
}
const drop = (tag: string, name: string) => tag.replace(new RegExp(`\\s${name}\\s*=\\s*(?:"[^"]*"|'[^']*')`, 'i'), '')
const unescaped = (value: string | undefined) => value?.replaceAll('&amp;', '&').replaceAll('&#038;', '&')
const isRoot = (src: string) => src.startsWith('/') && !src.startsWith('//')

/** A root image address as served: in the site's directory under a `base` (public/ is served there). */
const servedAt = (src: string) => (isRoot(src) ? servedPath(src) : src)

/**
 * The tag as written, made safe: its srcset kept only when every candidate is `src`'s own file (served under a
 * `base`), else gone; `sizes` only with a srcset, `auto` only with lazy loading; a known size written when it has none.
 */
function kept(tag: string, src: string): string {
  let next = isRoot(src) && servedAt(src) !== src ? write(tag, 'src', servedAt(src)) : tag
  const srcset = unescaped(read(next, 'srcset'))
  if (srcset !== undefined) {
    if (sameFile(src, srcset))
      next = write(next, 'srcset', srcset.split(/,\s+/).map((part) => { const [at = '', ...rest] = part.trim().split(/\s+/); return [servedAt(at), ...rest].join(' ') }).join(', '))
    else next = drop(next, 'srcset')
  }
  if (read(next, 'srcset') === undefined) next = drop(next, 'sizes')
  const sizes = read(next, 'sizes')
  if (sizes && /^auto\s*(?:,|$)/i.test(sizes) && read(next, 'loading') !== 'lazy') {
    const rest = sizes.replace(/^auto\s*,?\s*/i, '')
    next = rest ? write(next, 'sizes', rest) : drop(next, 'sizes')
  }
  const measured = read(next, 'width') && read(next, 'height') ? undefined : mediaSize(src)
  if (measured) next = sized(next, measured)
  return next
}

/** The tag with its missing width and height from `file` (the other side follows the file's ratio). */
function sized(tag: string, file: { width: number, height: number }): string {
  const given = { width: Number(read(tag, 'width')) || 0, height: Number(read(tag, 'height')) || 0 }
  if (given.width && given.height) return tag
  const width = given.width || (given.height ? Math.round(given.height * file.width / file.height) : file.width)
  const height = given.height || Math.round(width * file.height / file.width)
  let next = tag
  if (!given.width) next = write(next, 'width', String(width))
  if (!given.height) next = write(next, 'height', String(height))
  return next
}

/** The tag served as the resized `image`, `file` its full size. */
function resized(tag: string, image: Awaited<ReturnType<typeof getImage>>, file: { width: number, height: number }): string {
  const shown = Number(read(tag, 'width')) || file.width
  let next = write(tag, 'src', image.src)
  next = write(next, 'srcset', image.srcSet.attribute)
  if (!read(tag, 'sizes') || /^auto\b/.test(read(tag, 'sizes')!)) next = write(next, 'sizes', `(max-width: ${shown}px) 100vw, ${shown}px`)
  next = sized(next, file)
  if (read(tag, 'loading') === undefined) next = write(next, 'loading', 'lazy')
  if (read(tag, 'decoding') === undefined) next = write(next, 'decoding', 'async')
  return next
}

async function optimize(tag: string): Promise<string> {
  const src = unescaped(read(tag, 'src'))
  if (!src) return tag
  const shown = Number(read(tag, 'width')) || undefined
  try {
    if (isRoot(src)) {
      const load = LOCAL[`/public${decodeURI(withoutBase(src.split(/[?#]/)[0]!))}`]
      if (!load) return kept(tag, src)
      const local = await load()
      return resized(tag, await getImage({ src: local, widths: widthsUpTo(widthCap(local.width, shown)), format: 'webp' }), local)
    }
    // A media host the site allows: fetched at build time and resized, when its size is known (nothing is fetched to
    // learn it). Any other host is never fetched.
    if (/^https?:\/\//i.test(src) && RASTER.test(src.split(/[?#]/)[0]!) && isRemoteAllowed(src, allowed)) {
      const width = Number(read(tag, 'width')) || 0
      const height = Number(read(tag, 'height')) || 0
      const file = width && height ? { width, height } : mediaSize(src)
      if (file) return resized(tag, await getImage({ src, width: file.width, height: file.height, widths: widthsUpTo(widthCap(file.width, shown)), format: 'webp' }), file)
    }
    return kept(tag, src)
  }
  catch {
    // An image that cannot be processed (a corrupt file, an escape that is not one) stays as written, made safe: the
    // page still builds and shows it.
    return kept(tag, src)
  }
}

/** The HTML with every `<img>` served responsively: resized where the build can, the source's own set where it cannot. */
export async function optimizedImages(html: string): Promise<string> {
  const tags = [...new Set(html.match(IMG) ?? [])]
  if (!tags.length) return html
  const done = new Map(await Promise.all(tags.map(async tag => [tag, await optimize(tag)] as const)))
  return html.replace(IMG, tag => done.get(tag) ?? tag)
}

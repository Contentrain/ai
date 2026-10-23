// A srcset's candidates, and the file each one is. Kept apart from `body-images.ts` (which reads `astro:assets`) so
// the rule runs, and is tested, on its own.

/**
 * The file an address is, whatever size of it: host and path, with WordPress's size suffixes (`-300x200`, `-scaled`)
 * taken off the name. The suffix may sit before a second extension that an image plugin added (Smush, EWWW, WebP
 * Express serve `photo-300x200.jpg.webp`), so that one is taken off too. `null` for an address that is not one.
 */
function attachment(src: string): string | null {
  try {
    const url = new URL(src, 'https://site.invalid')
    return `${url.host}${url.pathname.replace(/(?:-\d+x\d+|-scaled)+((?:\.(?:avif|gif|jpe?g|png|tiff?|webp))?\.[a-z0-9]+)$/i, '$1')}`
  }
  catch { return null }
}

/** The address of each candidate of a srcset (`a.jpg 300w, b.jpg 600w`). */
const candidates = (srcset: string) => srcset.split(/,\s+/).map(part => part.trim().split(/\s+/)[0] ?? '').filter(Boolean)

/** Every candidate of the srcset is `src`'s own file in another size. */
export function sameFile(src: string, srcset: string): boolean {
  const own = attachment(src)
  const list = candidates(srcset)
  return Boolean(own && list.length && list.every(candidate => attachment(candidate) === own))
}

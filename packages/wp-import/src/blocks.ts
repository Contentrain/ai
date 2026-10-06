import { BLOCK_TOKEN } from './rest-menus.js'

/**
 * A post body without Gutenberg's block delimiters (`<!-- wp:paragraph -->`, `<!-- /wp:paragraph -->`,
 * `<!-- wp:image {...} /-->`). Only the delimiters go (with the line break that ends them); the markup
 * inside every block stays, and so does any other comment. Block attributes are read from the delimiters
 * before this (menus, navigation), never from the stored body.
 *
 * A self-closing block (`<!-- wp:latest-posts /-->`, `<!-- wp:block {"ref":12} /-->`) holds no markup: WordPress
 * renders it on the server, so nothing of it survives. `onDynamic` hears its name (as written, `core/` omitted)
 * so the loss can be reported.
 */
export function stripBlockDelimiters(content: string, onDynamic?: (name: string) => void): string {
  return content.replace(new RegExp(`${BLOCK_TOKEN.source}\\r?\\n?`, 'g'), (_all, closer, ns, local, _json, selfClose) => {
    if (selfClose && !closer) onDynamic?.(`${ns ?? ''}${local}`)
    return ''
  })
}

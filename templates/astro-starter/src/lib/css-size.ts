/**
 * A font size from `site.config` that goes into a style attribute: a length, or a `clamp()`/`calc()`/`min()`/`max()`
 * of lengths. Anything else (a `;`, a `url()`) is dropped, so a value that did not come through plan validation
 * cannot add a declaration.
 */
const CSS_SIZE = /^(?!.*url\()(?:\d+(?:\.\d+)?(?:px|rem|em|%)|(?:clamp|calc|min|max)\([\d\s.,+*/()a-z%-]+\))$/

export function cssSize(value: string | undefined): string | undefined {
  return value && CSS_SIZE.test(value) ? `font-size: ${value}` : undefined
}

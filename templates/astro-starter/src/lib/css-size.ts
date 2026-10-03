/**
 * A font size from `site.config` that goes into a style attribute: a length, or a `clamp()`/`calc()`/`min()`/`max()`
 * of lengths. Anything else (a `;`, a `url()`) is dropped, so a value that did not come through plan validation
 * cannot add a declaration.
 */
const CSS_SIZE = /^(?!.*url\()(?:\d+(?:\.\d+)?(?:px|rem|em|%)|(?:clamp|calc|min|max)\([\d\s.,+*/()a-z%-]+\))$/

export function cssSize(value: string | undefined): string | undefined {
  return value && CSS_SIZE.test(value) ? `font-size: ${value}` : undefined
}

/** The same guard for the header's other values (a weight, a letter-spacing, a length): the value, or nothing. */
const WEIGHT = /^[1-9]00$/
const SPACING = /^(?:normal|-?\d+(?:\.\d+)?(?:px|rem|em))$/

export const cssLength = (value: string | undefined): string | undefined => (value && CSS_SIZE.test(value) ? value : undefined)
export const cssWeight = (value: string | undefined): string | undefined => (value && WEIGHT.test(value) ? value : undefined)
export const cssSpacing = (value: string | undefined): string | undefined => (value && SPACING.test(value) ? value : undefined)

// A cover's height reaches the style attribute only as a whole number of pixels: a value from a plan is data, not CSS.
export const coverHeight = (value: number | undefined): string | undefined => (Number.isInteger(value) && value! >= 100 && value! <= 2000 ? `${value}px` : undefined)

/**
 * `theme`: the heading's size is the site's for its level, the one the source's own `h1`/`h2` has (`--text-heading-1`,
 * fluid where the theme's is); the layout's scale is the fallback while the site declares none.
 * `size` names the level whose size the heading takes when that is not the level it is written at: a page keeps one
 * `h1`, so a source's second `h1` is written as an `h2` and still drawn at the `h1` size. A `size` alone is enough; with
 * none, the result is what it was before (the heading's own level under `theme`, nothing otherwise).
 */
export const headingStyle = (scale: 'default' | 'theme' | undefined, level: 1 | 2, size?: 'own' | 'h1' | 'h2' | undefined): string | undefined => {
  if (scale !== 'theme' && (!size || size === 'own')) return undefined
  const used = size === 'h1' ? 1 : size === 'h2' ? 2 : level
  return `font-size: var(--text-heading-${used}, var(--text-5xl)); line-height: var(--leading-heading, 1.2)`
}

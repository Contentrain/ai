// A cover's height reaches the style attribute only as a whole number of pixels: a value from a plan is data, not CSS.
export const coverHeight = (value: number | undefined): string | undefined => (Number.isInteger(value) && value! >= 100 && value! <= 2000 ? `${value}px` : undefined)

/**
 * `theme`: the heading's size is the site's for its level, the one the source's own `h1`/`h2` has (`--text-heading-1`,
 * fluid where the theme's is); the layout's scale is the fallback while the site declares none.
 */
export const headingStyle = (scale: 'default' | 'theme' | undefined, level: 1 | 2): string | undefined =>
  scale === 'theme' ? `font-size: var(--text-heading-${level}, var(--text-5xl)); line-height: var(--leading-heading, 1.2)` : undefined

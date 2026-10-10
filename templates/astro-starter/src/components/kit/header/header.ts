// The header's site-name colour: the site's link colour, a colour the source theme gives the name, or nothing.

/** A colour that may go into the brand's style attribute: hex, `rgb()`/`rgba()` or `hsl()`/`hsla()` of numbers. */
const COLOR = /^(?:#[0-9a-f]{3,8}|(?:rgb|hsl)a?\([\d\s.,%/deg]+\))$/i

/**
 * The `color` value for the brand: `link` → the site's link colour (the accent where none is set), a colour as it is,
 * anything else (a `;`, a `url()`, a name the plan never writes) → none, so the header keeps its text colour.
 */
export function brandColorValue(brandColor: string | undefined): string | undefined {
  if (brandColor === 'link') return 'var(--color-link, var(--color-accent))'
  return brandColor && COLOR.test(brandColor) ? brandColor : undefined
}

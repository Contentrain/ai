export type ContactKey = 'address' | 'phone' | 'email'

/** The footer's contact details, with the words the source prints before each and the order it prints them in. */
export interface ContactInput {
  address?: string | undefined
  phone?: string | undefined
  email?: string | undefined
  labels?: { address?: string | undefined, phone?: string | undefined, email?: string | undefined } | undefined
  order?: readonly ContactKey[] | undefined
}

const CONTACT_KEYS: readonly ContactKey[] = ['address', 'phone', 'email']

/** The details in the order given (unknown and repeated keys dropped), then the ones it left out in the default order. */
export function contactKeys(order: readonly string[] | undefined): ContactKey[] {
  const given = [...new Set((order ?? []).filter((key): key is ContactKey => (CONTACT_KEYS as readonly string[]).includes(key)))]
  return [...given, ...CONTACT_KEYS.filter(key => !given.includes(key))]
}

export interface FooterVarsInput {
  layout: 'simple' | 'columns'
  columnCount: number
  pack?: 'spread' | 'end' | undefined
  narrow?: 'stack' | 'row' | undefined
  packGap?: string | undefined
  packGapNarrow?: string | undefined
  linkSize?: string | undefined
  linkSizeNarrow?: string | undefined
}

/**
 * The custom properties the packed columns and sized links read, as one `style` value (empty: none). `linkSizeNarrow` is
 * its own property, applied below `md` by the class below whether the columns stack or stay in a row.
 */
export function footerVars(i: FooterVarsInput): string {
  const columns = i.layout === 'columns'
  const packed = columns && i.pack === 'end'
  return [
    columns ? `--footer-columns: ${Math.max(i.columnCount, 1)}` : '',
    packed && i.packGap ? `--footer-gap: ${i.packGap}` : '',
    packed && i.narrow === 'row' && i.packGapNarrow ? `--footer-gap-narrow: ${i.packGapNarrow}` : '',
    i.linkSize ? `--footer-link-size: ${i.linkSize}` : '',
    i.linkSizeNarrow ? `--footer-link-size-narrow: ${i.linkSizeNarrow}` : '',
  ].filter(Boolean).join('; ')
}

/** The link-size classes: the wide size everywhere, the narrow one (when given) overriding it below `md`. */
export function footerLinkSizeClasses(i: Pick<FooterVarsInput, 'linkSize' | 'linkSizeNarrow'>): string[] {
  return [
    i.linkSize ? '[&_nav_a]:text-[length:var(--footer-link-size)]' : '',
    i.linkSizeNarrow ? 'max-md:[&_nav_a]:text-[length:var(--footer-link-size-narrow)]' : '',
  ].filter(Boolean)
}

/**
 * The wordmark's SVG box (1000 wide) for a site name: the font size that makes the name about 1000 wide at 0.6em a
 * letter (its text is then stretched to exactly 1000 by letter spacing), the baseline under the capitals and the box's
 * height. `fit` keeps room for descenders; `crop` ends the box halfway up the capitals, so the footer cuts the letters.
 */
export function wordmarkBox(name: string, mode: 'fit' | 'crop'): { size: number, baseline: number, height: number } {
  const size = Math.round(1000 / (Math.max([...name.trim()].length, 1) * 0.6))
  const baseline = Math.round(size * 0.78)
  return { size, baseline, height: mode === 'fit' ? Math.round(size * 1) : Math.round(size * 0.42) }
}

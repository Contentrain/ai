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

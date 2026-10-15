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
 * Scripts that letter spacing breaks: joined (Arabic, Syriac, Thaana, N'Ko, Mongolian), set without it (Hebrew), or
 * built of clusters it splits (Indic and Southeast Asian), the same set the starter's stylesheet takes tracking from.
 * The wordmark is stretched by letter spacing, so a name in one of them gets none.
 */
const UNSPACED = /[\p{Script=Arabic}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Nko}\p{Script=Mongolian}\p{Script=Hebrew}\p{Script=Devanagari}\p{Script=Bengali}\p{Script=Gurmukhi}\p{Script=Gujarati}\p{Script=Oriya}\p{Script=Tamil}\p{Script=Telugu}\p{Script=Kannada}\p{Script=Malayalam}\p{Script=Sinhala}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}\p{Script=Tibetan}]/u
/** Full-width letters: CJK ideographs, kana, hangul and the full-width forms. */
const FULL = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\u3000-\u303F\uFF00-\uFFEF]/u

/**
 * A letter's width in em, guessed on the wide side for a bold heading face: the name's natural width then stays at or
 * under the box, so the stretch only ever adds letter spacing and never draws letters over each other.
 */
function letterWidth(letter: string): number {
  if (FULL.test(letter)) return 1.05
  if (/\s/u.test(letter)) return 0.3
  if (/[MWmw@&%]/u.test(letter)) return 1
  if (/[\p{Lu}\p{N}]/u.test(letter)) return 0.8
  if (/\p{L}/u.test(letter)) return 0.65
  return 0.45
}

/**
 * The wordmark's SVG box (1000 wide) for a site name, or none for a name letter spacing would break. The font size makes
 * the name's guessed width 1000 (its text is then stretched to exactly 1000 by letter spacing); the baseline sits under
 * the tallest letters (lower for full-width ones, which rise higher), and `fit` keeps room for descenders under it while
 * `crop` ends the box halfway up the letters, so the footer cuts them.
 */
export function wordmarkBox(name: string, mode: 'fit' | 'crop'): { size: number, baseline: number, height: number } | undefined {
  const letters = [...name.trim()]
  if (letters.length === 0 || UNSPACED.test(name)) return undefined
  const size = Math.floor(1000 / letters.reduce((sum, letter) => sum + letterWidth(letter), 0))
  const rise = letters.some(letter => FULL.test(letter)) ? 0.88 : 0.78
  const baseline = Math.round(size * rise)
  return { size, baseline, height: mode === 'fit' ? Math.round(size * (rise + 0.22)) : Math.round(size * (rise - 0.36)) }
}

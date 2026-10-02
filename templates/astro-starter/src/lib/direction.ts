// The writing direction of a language tag. Arabic, Hebrew, Persian, Urdu and the other right-to-left scripts set the
// page's `dir`: the kit's logical utilities (ms-/ps-/start-/border-s) and mirrored arrows read it, and so does the
// browser's own layout of tables, lists and form fields.
const RTL = new Set(['ar', 'arc', 'ckb', 'dv', 'fa', 'he', 'iw', 'ps', 'sd', 'ug', 'ur', 'yi'])

/** `rtl` for a right-to-left language or script subtag (`ar`, `fa-IR`, `ku-Arab`), else `ltr`. */
export function textDirection(lang: string): 'rtl' | 'ltr' {
  const [language = '', ...rest] = lang.toLowerCase().split(/[-_]/)
  return RTL.has(language) || rest.some(sub => sub === 'arab' || sub === 'hebr' || sub === 'thaa' || sub === 'syrc') ? 'rtl' : 'ltr'
}

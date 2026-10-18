// Tables inside rich text. A table with no table block around it (the classic editor's, or hand-written) is wrapped in
// a region that scrolls, so a wide one stays inside the column instead of widening the page (a phone zooms out to a
// page wider than its screen, and taps miss). The table keeps its own display, and with it its table semantics in
// every screen reader; the region is focusable so a keyboard can scroll it, and is named by the table's caption, else
// by `label`. A table block's figure scrolls already (wp-blocks.css) and is left as it is.

const TAG = /<(\/?)(table|figure|div)\b([^>]*)>/gi
const CLASS = /\sclass\s*=\s*(?:"([^"]*)"|'([^']*)')/i
const ID = /\sid\s*=\s*(?:"([^"]*)"|'([^']*)')/i
const CAPTION = /^\s*<caption\b([^>]*)>([\s\S]*?)<\/caption>/i

const classes = (attributes: string) => { const m = CLASS.exec(attributes); return (m?.[1] ?? m?.[2] ?? '').split(/\s+/) }
const attributeText = (text: string) => text.replaceAll('&', '&amp;').replaceAll('"', '&quot;')
const plain = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()

/** The region's name: the caption's own id, else the caption's text, else `label`. */
function named(table: string, open: string, label: string): string {
  const caption = CAPTION.exec(table.slice(open.length))
  if (caption) {
    const id = ID.exec(caption[1]!)
    if (id) return `aria-labelledby="${attributeText(id[1] ?? id[2]!)}"`
    const text = plain(caption[2]!)
    // The caption's text as written: entities stay entities, a quote is escaped for the attribute.
    if (text) return `aria-label="${text.replaceAll('"', '&quot;')}"`
  }
  return `aria-label="${attributeText(label)}"`
}

/**
 * The HTML with every outermost table that no table block or scroll region holds wrapped in
 * `<div class="table-scroll" role="region" tabindex="0" aria-label…>`. A table inside a table is left in its parent.
 */
export function scrollingTables(html: string, label: string): string {
  // Open figures and divs, each marked when it already scrolls its table (a table block, or a region from an earlier pass).
  const open: Array<{ tag: string, scrolls: boolean }> = []
  let depth = 0
  let start = -1
  let startTag = ''
  let out = ''
  let copied = 0
  for (const match of html.matchAll(TAG)) {
    const [whole, closing, name, attributes] = match as unknown as [string, string, string, string]
    const tag = name.toLowerCase()
    const at = match.index
    if (tag !== 'table') {
      if (depth > 0) continue
      if (!closing) open.push({ tag, scrolls: tag === 'figure' ? classes(attributes).includes('wp-block-table') : classes(attributes).includes('table-scroll') })
      else for (let i = open.length - 1; i >= 0; i--) if (open[i]!.tag === tag) { open.splice(i); break }
      continue
    }
    if (!closing) {
      if (depth++ === 0 && !open.some(element => element.scrolls)) { start = at; startTag = whole }
      continue
    }
    if (depth === 0) continue
    if (--depth === 0 && start !== -1) {
      const end = at + whole.length
      const table = html.slice(start, end)
      out += `${html.slice(copied, start)}<div class="table-scroll" role="region" tabindex="0" ${named(table, startTag, label)}>${table}</div>`
      copied = end
      start = -1
    }
  }
  return copied === 0 ? html : out + html.slice(copied)
}

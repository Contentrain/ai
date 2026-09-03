// Fragment balance check.
//
// Chrome is injected as raw HTML, so an unbalanced fragment does not fail the
// build — the browser silently repairs it and the page loses its layout. That
// is the failure that cost a page 36 against 100 when body chrome was split
// into before/after halves. Lifting a header or footer out of the body blob is
// only safe when each fragment closes what it opens, so the emitter checks and
// says which tags are dangling rather than trusting the producer's word.
//
// This is deliberately not an HTML parser: it skips comments, doctypes and raw
// text elements, tolerates the tags HTML lets you leave open, and reports what
// it finds. It answers "was this split mid-element?", not "is this valid HTML?".

const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
])

/** Tags a browser closes for you. Theme markup is full of them, so counting
 * them would report every real page as broken. */
const OPTIONAL_END_TAGS = new Set([
  'p', 'li', 'dt', 'dd', 'option', 'optgroup', 'thead', 'tbody',
  'tfoot', 'tr', 'td', 'th', 'rt', 'rp',
])

/** Elements whose content is text, not markup — `<script>if (a < b)</script>`. */
const RAW_TEXT_TAGS = new Set(['script', 'style', 'textarea', 'title'])

interface Tag {
  name: string
  closing: boolean
  selfClosing: boolean
}

function scanTags(html: string): Tag[] {
  const tags: Tag[] = []
  let i = 0
  while (i < html.length) {
    const lt = html.indexOf('<', i)
    if (lt === -1) break
    if (html.startsWith('<!--', lt)) {
      const end = html.indexOf('-->', lt + 4)
      i = end === -1 ? html.length : end + 3
      continue
    }
    if (html.startsWith('<!', lt) || html.startsWith('<?', lt)) {
      const end = html.indexOf('>', lt)
      i = end === -1 ? html.length : end + 1
      continue
    }
    const head = /^<(\/?)([a-zA-Z][a-zA-Z0-9-]*)/.exec(html.slice(lt, lt + 64))
    const [matched = '', slash = '', rawName = ''] = head ?? []
    if (!rawName) {
      i = lt + 1
      continue
    }
    // Walk to the tag's `>`, ignoring one inside a quoted attribute value.
    let j = lt + matched.length
    let quote = ''
    while (j < html.length) {
      const ch = html[j]
      if (quote) {
        if (ch === quote) quote = ''
      } else if (ch === '"' || ch === "'") {
        quote = ch
      } else if (ch === '>') {
        break
      }
      j++
    }
    const name = rawName.toLowerCase()
    const closing = slash === '/'
    tags.push({ name, closing, selfClosing: html.slice(lt, j + 1).endsWith('/>') })
    i = j + 1
    if (!closing && RAW_TEXT_TAGS.has(name)) {
      const close = html.toLowerCase().indexOf(`</${name}`, i)
      i = close === -1 ? html.length : close
    }
  }
  return tags
}

export interface BalanceReport {
  /** Elements opened and never closed — the fragment ends mid-element. */
  unclosed: string[]
  /** Elements closed but never opened — the fragment starts mid-element. */
  unopened: string[]
}

export function checkBalance(html: string): BalanceReport {
  const stack: string[] = []
  const unopened: string[] = []
  for (const tag of scanTags(html)) {
    if (VOID_TAGS.has(tag.name) || tag.selfClosing || OPTIONAL_END_TAGS.has(tag.name)) continue
    if (!tag.closing) {
      stack.push(tag.name)
      continue
    }
    const at = stack.lastIndexOf(tag.name)
    if (at === -1) unopened.push(tag.name)
    else stack.length = at
  }
  return { unclosed: stack.toReversed(), unopened }
}

/** Human-readable balance complaint, or null when the fragment is sound. */
export function balanceWarning(html: string): string | null {
  const { unclosed, unopened } = checkBalance(html)
  const parts: string[] = []
  if (unclosed.length) parts.push(`never closed: ${unclosed.join(', ')}`)
  if (unopened.length) parts.push(`closed but never opened: ${unopened.join(', ')}`)
  return parts.length ? parts.join('; ') : null
}

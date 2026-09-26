// Markdown fields (a section's body, a price plan's features) rendered at build
// time, with their links made public like every rich-text body.

import { marked } from 'marked'
import { publicHtml } from './links'

/** A markdown field as HTML: GitHub-flavoured, line breaks kept, links through the public link table. */
export async function renderMarkdown(markdown: string | undefined): Promise<string> {
  if (!markdown?.trim()) return ''
  return publicHtml(await marked.parse(markdown, { gfm: true, breaks: false }))
}

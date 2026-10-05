// /llms.txt (llmstxt.org) as text: the site's name, its tagline and a section of links per kind of page, the shape
// the emitter writes (and Yoast's generator). The route is src/pages/[llms].txt.ts.

/** The newest links of each kind; the emitter's limit. */
export const LLMS_LINKS = 100

export interface LlmsLink { title: string, url: string, description?: string | undefined, date?: Date | undefined }

/** One line of text: whitespace collapsed. */
const line = (value: string) => value.replace(/\s+/g, ' ').trim()
/** A link's text, its brackets and backslashes escaped. */
const label = (value: string) => line(value).replace(/[[\]\\]/g, '\\$&')
/** A link's address with nothing that would end the Markdown link early. */
const href = (url: string) => url.replace(/\(/g, '%28').replace(/\)/g, '%29').replace(/\s/g, '%20')

/** The llmstxt.org text: `# name`, `> tagline`, a `## section` of `- [title](url): description` per kind with links. */
export function llmsTxt(input: { title: string, description?: string | undefined, sections: Array<{ name: string, links: LlmsLink[] }> }): string {
  const out = [`# ${line(input.title)}`]
  if (input.description && line(input.description)) out.push('', `> ${line(input.description)}`)
  for (const section of input.sections) {
    if (!section.links.length) continue
    out.push('', `## ${line(section.name)}`, '')
    for (const link of section.links) {
      const description = link.description ? line(link.description) : ''
      out.push(`- [${label(link.title)}](${href(link.url)})${description ? `: ${description}` : ''}`)
    }
  }
  return `${out.join('\n')}\n`
}

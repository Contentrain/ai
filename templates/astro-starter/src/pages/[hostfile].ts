// The host's redirect rules: `_redirects`, the format Netlify and Cloudflare
// Pages read from the site's root. The redirects collection's old addresses
// (a host that reads neither still serves the redirect page built for each),
// then WordPress's query addresses (`/?p=12`), which only a host rule can
// answer — Netlify's query form, `/ p=12 /hello-world/ 301` — and the
// collection's other queried addresses (`/old.php id=3 /contact/ 302`).
// (A page file named `_redirects.ts` would be ignored: Astro skips pages whose
// name starts with an underscore, hence the parameter.)
import type { APIRoute, GetStaticPaths } from 'astro'
import { attachmentRules, prefixRules, queriedRules, queryRules, redirectRules } from '../lib/redirects'

/** Cloudflare Pages reads at most 2,000 static rules; Netlify reads more but slows with every one. */
const HOST_RULE_LIMIT = 2000

/** A WordPress query address in Netlify's query form: `/ p=12 /hello-world/ 301`. */
const query = (rule: { param: string, value: string, to: string, status: number }) => `/ ${rule.param}=${rule.value} ${rule.to} ${rule.status}`

export const getStaticPaths = (() => [{ params: { hostfile: '_redirects' } }]) satisfies GetStaticPaths

export const GET: APIRoute = async () => {
  const [rules, attachments, prefixes, queries, queried] = await Promise.all([redirectRules(), attachmentRules(), prefixRules(), queryRules(), queriedRules()])
  const own = queries.filter(rule => rule.param !== 'attachment_id')
  // A host takes the first rule that matches, so the order is WordPress's: the site's own redirects
  // (Redirection, Rank Math) answer before an attachment page does. Exact addresses, then prefixes,
  // then query addresses, and the attachment pages last.
  const lines = [
    ...rules.map(rule => (rule.status === 410 ? `${rule.from} /404.html 410` : `${rule.from} ${rule.to} ${rule.status}`)),
    ...prefixes.map(rule => `${rule.from} ${rule.to} ${rule.status}`),
    ...own.map(query),
    ...queried.map(rule => `${rule.path} ${rule.query.map(([name, value]) => `${encodeURIComponent(name)}=${encodeURIComponent(value)}`).join(' ')} ${rule.to} ${rule.status}`),
  ]
  // Attachment pages are the least of the old addresses: over the host's limit they are what gives way.
  const attachmentLines = [...attachments.paths.map(rule => `${rule.from} ${rule.to} ${rule.status}`), ...queries.filter(rule => rule.param === 'attachment_id').map(query)]
  const kept = attachmentLines.slice(0, Math.max(0, HOST_RULE_LIMIT - lines.length))
  const out = [...lines, ...kept]
  const note = kept.length < attachmentLines.length ? `# ${attachmentLines.length - kept.length} attachment page redirect(s) left out: over the host's ${HOST_RULE_LIMIT}-rule limit.\n` : ''
  return new Response(`# Generated at build: the redirects collection (edit in Contentrain Studio), prefixes, then query addresses, then attachment pages.\n${note}${out.join('\n')}\n`, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}

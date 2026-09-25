// The host's redirect rules: `_redirects`, the format Netlify and Cloudflare
// Pages read from the site's root. The redirects collection's old addresses
// (a host that reads neither still serves the redirect page built for each),
// then WordPress's query addresses (`/?p=12`), which only a host rule can
// answer — Netlify's query form, `/ p=12 /hello-world/ 301` — and the
// collection's other queried addresses (`/old.php id=3 /contact/ 302`).
// (A page file named `_redirects.ts` would be ignored: Astro skips pages whose
// name starts with an underscore, hence the parameter.)
import type { APIRoute, GetStaticPaths } from 'astro'
import { prefixRules, queriedRules, queryRules, redirectRules } from '../lib/redirects'

export const getStaticPaths = (() => [{ params: { hostfile: '_redirects' } }]) satisfies GetStaticPaths

export const GET: APIRoute = async () => {
  const [rules, prefixes, queries, queried] = await Promise.all([redirectRules(), prefixRules(), queryRules(), queriedRules()])
  const lines = [
    ...rules.map(rule => (rule.status === 410 ? `${rule.from} /404.html 410` : `${rule.from} ${rule.to} ${rule.status}`)),
    // After the exact addresses: a host takes the first rule that matches.
    ...prefixes.map(rule => `${rule.from} ${rule.to} ${rule.status}`),
    ...queries.map(rule => `/ ${rule.param}=${rule.value} ${rule.to} ${rule.status}`),
    ...queried.map(rule => `${rule.path} ${rule.query.map(([name, value]) => `${encodeURIComponent(name)}=${encodeURIComponent(value)}`).join(' ')} ${rule.to} ${rule.status}`),
  ]
  return new Response(`# Generated at build: the redirects collection (edit in Contentrain Studio), then query addresses.\n${lines.join('\n')}\n`, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}

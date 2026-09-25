// The host's redirect rules: `_redirects`, the format Netlify and Cloudflare
// Pages read from the site's root. The redirects collection's old addresses
// (a host that reads neither still serves the redirect page built for each),
// then WordPress's query addresses (`/?p=12`), which only a host rule can
// answer — Netlify's query form, `/ p=12 /hello-world/ 301`.
// (A page file named `_redirects.ts` would be ignored: Astro skips pages whose
// name starts with an underscore, hence the parameter.)
import type { APIRoute, GetStaticPaths } from 'astro'
import { queryRules, redirectRules } from '../lib/redirects'

export const getStaticPaths = (() => [{ params: { hostfile: '_redirects' } }]) satisfies GetStaticPaths

export const GET: APIRoute = async () => {
  const [rules, queries] = await Promise.all([redirectRules(), queryRules()])
  const lines = [
    ...rules.map(rule => (rule.status === 410 ? `${rule.from} /404.html 410` : `${rule.from} ${rule.to} ${rule.status}`)),
    ...queries.map(rule => `/ ${rule.param}=${rule.value} ${rule.to} 301`),
  ]
  return new Response(`# Generated at build: the redirects collection (edit in Contentrain Studio), then WordPress query addresses.\n${lines.join('\n')}\n`, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}

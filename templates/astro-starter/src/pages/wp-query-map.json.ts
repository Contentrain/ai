// WordPress's query addresses (`/?p=12`, `/?page_id=7`, `/?cat=3`, `/?tag=slug`,
// `/?author=2`) and where each public entry lives now: the data behind the
// home page's fallback redirect, published for hosts and checks to read.
import type { APIRoute } from 'astro'
import { queryMap } from '../lib/redirects'

export const GET: APIRoute = async () => new Response(`${JSON.stringify(await queryMap(), null, 2)}\n`, {
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
})

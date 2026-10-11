// A page with nothing to build: no body, form, cover, child pages or composed view — a composition the move left out.
// It never fails the build. The front page builds as the plain latest-posts home; any other page answers with a 301 to
// its nearest parent, else the home, and is not listed as a page of its own (sitemap, llms.txt).
import { composedViews } from '../views/composed'
import type { Route } from './site-routes'

export function leftEmpty(route: Route): boolean {
  if (route.view !== 'page') return false
  const { data } = route.page
  return !composedViews[data.wp_id ?? -1] && !data.body?.trim() && !data.form && !data.cover && route.subpages.length === 0
}

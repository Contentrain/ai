// The fixture's composed views: the front, keyed by the reserved id the plan gives a front with no page entry (-2:
// never a WordPress id).
import type PageView from '../PageView.astro'
import Front from './Front.astro'

export const composedViews: Partial<Record<number, typeof PageView>> = {
  [-2]: Front,
}

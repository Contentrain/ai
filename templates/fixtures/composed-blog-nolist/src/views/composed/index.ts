// The fixture's composed views, as an index written before `listViews` (an older writer, an agent's own): the posts
// page is drawn from sections but named as printing no list, so page 1 of the posts stays a plain list.
import type PageView from '../PageView.astro'
import PostsPage from './PostsPage.astro'

export const composedViews: Partial<Record<number, typeof PageView>> = {
  802: PostsPage,
}

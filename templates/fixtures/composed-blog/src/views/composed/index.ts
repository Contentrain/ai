// The fixture's composed views: the posts page, drawn from sections with the list among them.
import type PageView from '../PageView.astro'
import PostsPage from './PostsPage.astro'

export const composedViews: Partial<Record<number, typeof PageView>> = {
  802: PostsPage,
}

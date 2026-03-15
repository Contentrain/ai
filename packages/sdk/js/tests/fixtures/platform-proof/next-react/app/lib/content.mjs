import { document, query } from '#contentrain'

export function run() {
  return {
    firstPostTitle: query('blog-post').locale('en').first().title,
    firstArticleSlug: document('blog-article').locale('en').first().slug,
  }
}

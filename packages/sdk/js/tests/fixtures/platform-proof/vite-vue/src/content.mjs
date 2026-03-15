import { query, singleton } from '#contentrain'

export function run() {
  return {
    heroTitle: singleton('hero').get().title,
    postCount: query('blog-post').all().length,
  }
}

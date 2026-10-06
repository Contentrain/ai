import { BLOCK_TOKEN } from './rest-menus.js'

/**
 * A post body without Gutenberg's block delimiters (`<!-- wp:paragraph -->`, `<!-- /wp:paragraph -->`,
 * `<!-- wp:image {...} /-->`). Only the delimiters go (with the line break that ends them); the markup
 * inside every block stays, and so does any other comment. Block attributes are read from the delimiters
 * before this (menus, navigation), never from the stored body.
 */
export function stripBlockDelimiters(content: string): string {
  return content.replace(new RegExp(`${BLOCK_TOKEN.source}\\r?\\n?`, 'g'), '')
}

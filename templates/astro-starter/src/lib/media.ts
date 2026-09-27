// Image sizes the migration measured, by src. Content keeps only an image's
// address (a list item's `image` is one field, so a page stays within
// Contentrain's nesting depth); the width and height that stop the layout
// shifting come from here. The writer fills src/lib/media-sizes.ts; the
// starter ships it empty and images of unknown size stay plain lazy <img>.

import { MEDIA_SIZES as SIZES } from './media-sizes'

/** The measured size of an image, by the address content stores. */
export function mediaSize(src: string): { width: number, height: number } | undefined {
  return SIZES[src] ?? SIZES[src.split(/[?#]/)[0]!]
}

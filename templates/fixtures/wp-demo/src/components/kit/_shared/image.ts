import type { ImageInput } from './types'

/**
 * An image in a list item: the address alone, with its text in a sibling field (`image` + `imageAlt`),
 * so a page singleton stays within Contentrain's nesting depth. The object form is still read, and
 * leaves in 0.7.
 */
export type ImageSource = ImageInput | string

/** A list item's image as the kit draws it: its address, its text, and the size the site measured. */
export function imageOf(image: ImageSource | undefined, alt?: string | undefined): ImageInput | undefined {
  if (image === undefined || image === '') return undefined
  return typeof image === 'string' ? { src: image, alt: alt ?? '' } : { ...image, alt: alt ?? image.alt }
}

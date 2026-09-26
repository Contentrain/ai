// Value shapes the kit components share. Plain data — what a Contentrain
// entry resolves to — so a page passes content straight through.

/** An image with the text that replaces it. Dimensions let astro:assets size it. */
export interface ImageInput {
  src: string
  /** What the image shows. Empty or absent means decoration: it renders `alt=""`, never invented text. */
  alt?: string | undefined
  width?: number | undefined
  height?: number | undefined
}

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

export interface LinkInput {
  label: string
  href: string
  newTab?: boolean | undefined
}

/** A call to action: a link drawn as a button. */
export interface ActionInput extends LinkInput {
  style?: 'primary' | 'secondary' | 'ghost' | undefined
}

/** A menu entry, possibly with children (one level shown in the kit's navigation). */
export interface NavItem extends LinkInput {
  children?: NavItem[] | undefined
}

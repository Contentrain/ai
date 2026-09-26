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

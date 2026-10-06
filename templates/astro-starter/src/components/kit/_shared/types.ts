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

/** The widths a migration measures a page at: phone, tablet, desktop (the kit's base, `md` and `lg`). */
export type MeasuredWidth = 390 | 768 | 1280

/**
 * A section's style as measured on the source page (`MeasuredStyle` in `@contentrain/types`, same fields). Absent,
 * a section takes the site's tokens; present, it wins over the tone and column variants. Values are pixels; Section
 * checks each one and drops what is not a number, a colour or a known keyword.
 */
export interface MeasuredStyle {
  /** The frame's content width. */
  containerPx?: number | undefined
  /** The section's top and bottom padding. */
  padY?: number | undefined
  /** The frame's side padding (the gutter). */
  padX?: number | undefined
  bg?: {
    /** Hex, rgb(a) or hsl(a). */
    color?: string | undefined
    /** http(s) or root-relative address; drawn as an image behind the content. */
    image?: string | undefined
    /** A colour laid over the image (with its alpha). */
    overlay?: string | undefined
    size?: 'cover' | 'contain' | 'auto' | undefined
    /** One or two of center/top/bottom/left/right or percentages. */
    position?: string | undefined
  } | undefined
  /** Item columns per measured width; a missing width follows the narrower one. */
  columns?: Partial<Record<MeasuredWidth, number>> | undefined
  /** The gap between items. */
  gap?: number | undefined
  /** What the section's text is set for: `dark` is light text on a dark band. */
  tone?: 'light' | 'dark' | undefined
  /** Card and item corner radius. */
  radius?: number | undefined
  minHeight?: number | undefined
}

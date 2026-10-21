import type { ImageInput } from './types'

const spoken = (text: string): string => text.replace(/\s+/g, ' ').trim().replace(/[.:;!]+$/, '').toLowerCase()

/**
 * A card's image beside its title link: when the title's link covers the card (a stretched link) and the image's text
 * only repeats the title, the image is drawn with an empty text, so a screen reader says the title once. The content
 * keeps its text (Studio, image search); an image outside such a card, or with words of its own, is drawn as written.
 */
export function cardImage(image: ImageInput | undefined, title: string | undefined, linked: boolean): ImageInput | undefined {
  if (!image || !linked || !image.alt || !title || spoken(image.alt) !== spoken(title)) return image
  return { ...image, alt: '' }
}

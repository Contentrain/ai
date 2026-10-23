// The width ladder of every resized image (KitImage for sections, the starter's lib/body-images for rich text): the
// candidates of a srcset, up to the largest one, and the browser picks one by `sizes`.

const STEPS = [320, 640, 960, 1280, 1600, 1920, 2560]

/** Candidate widths up to `max`, `max` itself the last. */
export const widthsUpTo = (max: number): number[] => [...STEPS.filter(step => step < max), max]

/**
 * The largest width worth making of a file shown at `shown` px: twice that (a 2× screen), never more than the file.
 * Without a shown width, the file's own.
 */
export const widthCap = (file: number, shown?: number): number => (shown && shown > 0 ? Math.min(file, 2 * shown) : file)

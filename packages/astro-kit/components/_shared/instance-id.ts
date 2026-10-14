// A component's id when the page gives none. Its tabs, lightboxes, labels and buttons point at elements by id
// (`aria-controls`, `popovertarget`, `for`), so two instances on one page that both took the same default (two galleries,
// two FAQs, two newsletters) would point into each other: a click in the second opened the first one's image. Each
// default is taken once per page instead: `gallery`, then `gallery-2`, `gallery-3`, in the order the page renders
// them, the same on every build. An id the page gives is kept as it is, and a default steps around it.

const taken = new WeakMap<object, Set<string>>()

/** `given` when set, else `base`, `base-2`, … — the first one not yet used on this page (`page` = `Astro.locals`). */
export function instanceId(page: object, given: string | undefined, base: string): string {
  let ids = taken.get(page)
  if (!ids) {
    ids = new Set()
    taken.set(page, ids)
  }
  if (given) {
    ids.add(given)
    return given
  }
  let id = base
  for (let n = 2; ids.has(id); n++) id = `${base}-${n}`
  ids.add(id)
  return id
}

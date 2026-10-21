// Something a page states once, whichever component prints it: the first FAQ on a page carries the page's FAQPage, a
// second one would state a second FAQPage for the same page. Taken in the order the page renders its components, the
// same on every build (`page` = `Astro.locals`, as in instance-id.ts).

const claimed = new WeakMap<object, Set<string>>()

/** True for the first caller on this page that claims `what`, false for every later one. */
export function firstOnPage(page: object, what: string): boolean {
  let taken = claimed.get(page)
  if (!taken) {
    taken = new Set()
    claimed.set(page, taken)
  }
  if (taken.has(what)) return false
  taken.add(what)
  return true
}

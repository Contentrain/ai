// Pages composed from sections, keyed by WordPress id. A migration writes one
// view per page it composed (hero, cards, text between them) and lists it
// here; every other page renders its body as rich text (PageView). A composed
// view takes PageView's props, so the route table treats both alike. A view
// that prints the post list it is given (`list`: the front page or the posts
// page drawn from sections) is named in `listViews`; one that is not gets no
// list, and page 1 of the posts stays a plain list.
import type PageView from '../PageView.astro'

export const composedViews: Partial<Record<number, typeof PageView>> = {}

export const listViews: ReadonlySet<number> = new Set()

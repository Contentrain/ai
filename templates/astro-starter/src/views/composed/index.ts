// Pages composed from sections, keyed by WordPress id. A migration writes one
// view per page it composed (hero, cards, text between them) and lists it
// here; every other page renders its body as rich text (PageView). A composed
// view takes PageView's props, so the route table treats both alike.
import type PageView from '../PageView.astro'

export const composedViews: Partial<Record<number, typeof PageView>> = {}

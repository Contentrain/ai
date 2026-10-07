// What the source draws over every page, outside the header and footer: a popup
// (Elementor Popup, Popup Maker). A migration writes one component per overlay
// in the plan's layout, each reading its own singleton, and lists them here in
// source order. BaseLayout renders them after the footer. None by default.
import type { AstroComponentFactory } from 'astro/runtime/server/index.js'

export const overlays: readonly AstroComponentFactory[] = []

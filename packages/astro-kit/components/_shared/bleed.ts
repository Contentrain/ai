// The viewport's edge, from the content's edge: what the page frame leaves of the window, halved, plus the frame's own
// gutter (`container-page` caps its width with the gutter inside it). A section whose image runs on to the window's
// edge (Split, Hero `imageBleed`) pulls it out by this much on its side, on wide screens. Literal class names, so the
// stylesheet builder sees them.
export const BLEED = {
  end: 'md:-me-[calc((100vw-min(var(--container-page)+2*var(--container-inset,0px),100vw))/2+var(--spacing-gutter,2rem))]',
  start: 'md:-ms-[calc((100vw-min(var(--container-page)+2*var(--container-inset,0px),100vw))/2+var(--spacing-gutter,2rem))]',
} as const

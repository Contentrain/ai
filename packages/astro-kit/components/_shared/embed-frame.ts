// The player a click on an embed poster becomes: one recipe for the kit Embed, a Slider slide and a behaviour
// island's video link, so the frame's permissions are written once. The address is always an `EmbedTarget`'s `src`
// (built by embed-target.ts from a known provider), never text from the content.

/** An iframe for `src`, named `title`, filling its positioned frame. */
export function playerFrame(src: string, title: string, className = 'absolute inset-0 h-full w-full border-0'): HTMLIFrameElement {
  const frame = document.createElement('iframe')
  frame.src = src
  frame.title = title
  frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen; clipboard-write'
  frame.allowFullscreen = true
  frame.referrerPolicy = 'strict-origin-when-cross-origin'
  frame.className = className
  return frame
}

/** A plain left click: a modified one (new tab, new window) keeps the link's own behaviour. */
export const plainClick = (event: MouseEvent): boolean => !event.defaultPrevented && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey

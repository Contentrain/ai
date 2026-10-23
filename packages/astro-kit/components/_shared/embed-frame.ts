// The player a click on an embed poster becomes: one recipe for the kit Embed, a Slider slide and a behaviour
// island's video link, so the frame's permissions are written once. The address is checked again at the click: what
// the page carries (`data-embed-src`, which an edited page could change) goes through embed-target.ts once more, and
// the frame loads the address that builds from a known provider, never the attribute's text.
import { embedTarget } from './embed-target'

/** An iframe for the player at `src`, named `title`, filling its positioned frame; none when `src` is no known player. */
export function playerFrame(src: string | undefined, title: string, className = 'absolute inset-0 h-full w-full border-0'): HTMLIFrameElement | null {
  const target = src ? embedTarget(src) : null
  if (!target) return null
  const frame = document.createElement('iframe')
  frame.src = target.src
  frame.title = title
  frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen; clipboard-write'
  frame.allowFullscreen = true
  frame.referrerPolicy = 'strict-origin-when-cross-origin'
  frame.className = className
  return frame
}

/** A plain left click: a modified one (new tab, new window) keeps the link's own behaviour. */
export const plainClick = (event: MouseEvent): boolean => !event.defaultPrevented && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey

// A section's measured style (`MeasuredStyle`) as CSS the kit can trust. The values come from a page the
// migration measured: data, not CSS. Each one is checked against a small grammar and dropped when it does not
// fit, so nothing but a number, a colour or a known keyword reaches a style attribute.
import type { MeasuredStyle, MeasuredWidth } from './types'

const clamp = (value: unknown, min: number, max: number): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? Math.round(value) : undefined

const HEX = /^#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i
const FUNCTIONAL = /^(?:rgba?|hsla?)\(\s*[\d.]+%?(?:\s*[,\s]\s*[\d.]+%?){2}(?:\s*[,/]\s*[\d.]+%?)?\s*\)$/i
const NAMED = /^(?:transparent|white|black)$/i

/** A colour the source wrote as hex, rgb(a) or hsl(a) (or transparent / white / black); anything else is dropped. */
const colorOf = (value: unknown): string | undefined =>
  typeof value === 'string' && (HEX.test(value.trim()) || FUNCTIONAL.test(value.trim()) || NAMED.test(value.trim())) ? value.trim() : undefined

/** Whether a colour is dark enough to need light text (relative luminance under 0.4); unknown for named and hsl colours. */
const isDark = (color: string): boolean | undefined => {
  const hex = HEX.test(color) ? color.slice(1) : undefined
  const channels = hex
    ? (hex.length <= 4 ? hex.slice(0, 3).split('').map(digit => Number.parseInt(digit + digit, 16)) : [0, 2, 4].map(i => Number.parseInt(hex.slice(i, i + 2), 16)))
    : /^rgba?\(/i.test(color) ? color.match(/[\d.]+%?/g)!.slice(0, 3).map(v => (v.endsWith('%') ? Number.parseFloat(v) * 2.55 : Number.parseFloat(v))) : undefined
  if (!channels) return /^black$/i.test(color) ? true : /^white$/i.test(color) ? false : undefined
  const [r, g, b] = channels.map(v => { const c = v / 255; return c <= 0.039_28 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 })
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b! < 0.4
}

const STOP = /^(.+?)(?:\s+\d{1,3}(?:\.\d+)?%){0,2}$/
const DIRECTION = /^(?:\d{1,3}(?:\.\d+)?deg|to (?:top|bottom|left|right)(?: (?:top|bottom|left|right))?|circle|ellipse)$/
/** Splits at commas outside parentheses: `rgba(0, 0, 0, .5) 0%, #000` → two stops. */
const topLevel = (inner: string): string[] => {
  const parts: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < inner.length; i++) {
    if (inner[i] === '(') depth++
    else if (inner[i] === ')') depth--
    else if (inner[i] === ',' && depth === 0) { parts.push(inner.slice(start, i).trim()); start = i + 1 }
    if (depth < 0) return []
  }
  return depth === 0 ? [...parts, inner.slice(start).trim()] : []
}
/** An overlay: a colour, or a linear/radial gradient whose every stop is a colour (with up to two percentages). */
const overlayOf = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined
  const text = value.trim()
  const gradient = /^(linear|radial)-gradient\((.*)\)$/i.exec(text)
  if (!gradient) return colorOf(text)
  const parts = topLevel(gradient[2]!)
  if (parts.length < 2) return undefined
  const [first, ...rest] = DIRECTION.test(parts[0]!) ? parts : ['', ...parts]
  const stops = first ? rest : parts
  return stops.length >= 2 && stops.every(stop => colorOf(STOP.exec(stop)?.[1]) !== undefined) ? text : undefined
}

/** An image address: http(s) or root-relative, with nothing that could close a quote or a url(). */
const imageOf = (value: unknown): string | undefined =>
  typeof value === 'string' && /^(?:https?:\/\/|\/(?!\/))/i.test(value) && !/["'()<>\\\s]/.test(value) ? value : undefined

const KEYWORD = /^(?:center|top|bottom|left|right)$/
const PERCENT = /^\d{1,3}(?:\.\d+)?%$/
/** `object-position` from the source's background position: up to two keywords or percentages. */
const positionOf = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined
  const parts = value.trim().toLowerCase().split(/\s+/)
  return parts.length <= 2 && parts.every(part => KEYWORD.test(part) || PERCENT.test(part)) ? parts.join(' ') : undefined
}

/** `object-fit` from the source's background size. */
const fitOf = (value: unknown): 'cover' | 'contain' | 'none' | undefined =>
  value === 'cover' || value === 'contain' ? value : value === 'auto' ? 'none' : undefined

/** Columns at each measured width, every width filled: 390 ?? 1; 768 ?? min(2, 1280) ?? 390; 1280 ?? 768 ?? 390. */
const columnsFor = (columns: MeasuredStyle['columns']): Record<MeasuredWidth, number> | undefined => {
  if (!columns) return undefined
  const at = (width: MeasuredWidth) => clamp(columns[width], 1, 6)
  const [narrow, mid, wide] = [at(390), at(768), at(1280)]
  if (narrow === undefined && mid === undefined && wide === undefined) return undefined
  const phone = narrow ?? 1
  const tablet = mid ?? (wide === undefined ? phone : Math.min(2, wide))
  return { 390: phone, 768: tablet, 1280: wide ?? mid ?? phone }
}

/** What Section draws from a measured style. Empty (`{}`) when there is nothing to draw. */
export interface MeasuredFrame {
  /** Inline style on the section element: custom properties and the section's own box. */
  style?: string | undefined
  /** Inline style on the frame: its width (`--container-page`; Section renames it for the reading column) and gutter. */
  frameStyle?: string | undefined
  /** The section's text colour, from what the band's text is set for. */
  tone?: 'light' | 'dark' | undefined
  /** The section's own background colour (it then draws no tone fill). */
  color?: string | undefined
  image?: { src: string, fit?: 'cover' | 'contain' | 'none' | undefined, position?: string | undefined } | undefined
  /** A colour or gradient over the image (or over the fill); it is drawn as a layer's `background`. */
  overlay?: string | undefined
}

export function measuredFrame(measured: MeasuredStyle | undefined): MeasuredFrame {
  if (!measured) return {}
  const own: string[] = []
  const frame: string[] = []
  const container = clamp(measured.containerPx, 240, 2560)
  const padY = clamp(measured.padY, 0, 400)
  const padX = clamp(measured.padX, 0, 200)
  const gap = clamp(measured.gap, 0, 200)
  const radius = clamp(measured.radius, 0, 200)
  const minHeight = clamp(measured.minHeight, 0, 2000)
  const columns = columnsFor(measured.columns)
  if (columns) own.push(`--kit-cols-390: ${columns[390]}`, `--kit-cols-768: ${columns[768]}`, `--kit-cols-1280: ${columns[1280]}`)
  if (gap !== undefined) own.push(`--kit-gap: ${gap}px`)
  if (radius !== undefined) own.push(`--radius-card: ${radius}px`)
  if (padY !== undefined) own.push(`padding-block: ${padY}px`)
  if (minHeight) own.push(`min-height: ${minHeight}px`)
  // The frame's width without its gutter, as `container-page` takes it; the gutter is the side padding.
  if (container !== undefined) frame.push(`--container-page: ${container}px`)
  if (padX !== undefined) frame.push(`--spacing-gutter: ${padX}px`)
  const color = colorOf(measured.bg?.color)
  const src = imageOf(measured.bg?.image)
  // The text's tone as measured; with a fill and no tone, the fill's own lightness decides.
  const given = measured.tone === 'light' || measured.tone === 'dark' ? measured.tone : undefined
  const tone = given ?? (color === undefined ? undefined : isDark(color) ? 'dark' : 'light')
  return {
    style: own.length ? own.join('; ') : undefined,
    frameStyle: frame.length ? frame.join('; ') : undefined,
    tone,
    color,
    image: src ? { src, fit: fitOf(measured.bg?.size) ?? 'cover', position: positionOf(measured.bg?.position) } : undefined,
    overlay: overlayOf(measured.bg?.overlay),
  }
}

/**
 * A list's grid at the measured columns and gap, or `undefined` to keep the component's own variant. The class
 * names are written out in full so Tailwind finds them; Section sets the custom properties they read.
 */
export function measuredGrid(measured: MeasuredStyle | undefined): string | undefined {
  if (!measured) return undefined
  const columns = columnsFor(measured.columns) ? 'grid-cols-[repeat(var(--kit-cols-390),minmax(0,1fr))] md:grid-cols-[repeat(var(--kit-cols-768),minmax(0,1fr))] lg:grid-cols-[repeat(var(--kit-cols-1280),minmax(0,1fr))]' : ''
  const gap = clamp(measured.gap, 0, 200) !== undefined ? 'gap-[var(--kit-gap)] md:gap-[var(--kit-gap)]' : ''
  return [columns, gap].filter(Boolean).join(' ') || undefined
}

/**
 * A list laid out in CSS columns (not a grid, so items of unequal height pack) at the measured columns and gap, or
 * `undefined` to keep the component's own variant. Literal class names, read from the custom properties Section sets.
 */
export function measuredColumns(measured: MeasuredStyle | undefined): string | undefined {
  if (!measured || !columnsFor(measured.columns)) return undefined
  const gap = clamp(measured.gap, 0, 200) !== undefined ? 'gap-x-[var(--kit-gap)]' : ''
  return ['block columns-[var(--kit-cols-390)] md:columns-[var(--kit-cols-768)] lg:columns-[var(--kit-cols-1280)]', gap].filter(Boolean).join(' ')
}

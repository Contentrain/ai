import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * A dark band (`tone="inverse"`) in the starter's default theme: every text role drawn on it reads at 4.5:1 or more
 * against the ink it sits on (WCAG 1.4.3). The starter is what a site gets before it sets a theme of its own, so its
 * defaults have to pass on their own.
 */
const ROOT = join(import.meta.dirname, '..', '..', '..')
const COMPONENTS = join(import.meta.dirname, '..', 'components')

type Rgb = [number, number, number]

/** The starter's `@theme` declarations, by name. */
async function themeTokens(): Promise<Map<string, string>> {
  const css = await readFile(join(ROOT, 'templates', 'astro-starter', 'src', 'styles', 'global.css'), 'utf8')
  const block = /@theme \{([\s\S]*?)\n\}/.exec(css)![1]!.replace(/\/\*[\s\S]*?\*\//g, '')
  return new Map([...block.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)].map(m => [m[1]!, m[2]!.trim()]))
}

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const toSrgb = (c: number) => Math.min(1, Math.max(0, c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055))

function toOklab([r, g, b]: Rgb): Rgb {
  const [lr, lg, lb] = [r, g, b].map(toLinear) as Rgb
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s]
}

function fromOklab([L, a, b]: Rgb): Rgb {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s].map(toSrgb) as Rgb
}

/** A token's colour: a hex value, another token (`var(--x)`), or `color-mix(in oklab, A p%, B)` of two of those. */
function colour(value: string, tokens: Map<string, string>): Rgb {
  const hex = /^#([0-9a-f]{6})$/i.exec(value)
  if (hex) return [0, 2, 4].map(i => Number.parseInt(hex[1]!.slice(i, i + 2), 16) / 255) as Rgb
  const ref = /^var\(--([a-z0-9-]+)\)$/.exec(value)
  if (ref) return colour(tokens.get(ref[1]!)!, tokens)
  const mix = /^color-mix\(in oklab, (.+?) (\d+)%, (.+)\)$/.exec(value)
  if (mix) {
    const [a, b] = [toOklab(colour(mix[1]!, tokens)), toOklab(colour(mix[3]!, tokens))]
    const p = Number(mix[2]) / 100
    return fromOklab([0, 1, 2].map(i => a[i]! * p + b[i]! * (1 - p)) as Rgb)
  }
  throw new Error(`a colour this test cannot read: ${value}`)
}

const luminance = (rgb: Rgb) => { const [r, g, b] = rgb.map(toLinear) as Rgb; return 0.2126 * r + 0.7152 * g + 0.0722 * b }
const contrast = (x: Rgb, y: Rgb) => { const [a, b] = [luminance(x), luminance(y)].toSorted((p, q) => q - p) as [number, number]; return (a + 0.05) / (b + 0.05) }

describe('a dark band in the starter\'s default theme', () => {
  it('draws every text role on it at 4.5:1 or more: the light text, its quieter twin, and text in the accent', async () => {
    const tokens = await themeTokens()
    const ink = colour(tokens.get('color-ink')!, tokens)
    for (const role of ['color-surface', 'color-ink-muted-inverse', 'color-accent-text-inverse']) {
      expect(contrast(colour(tokens.get(role)!, tokens), ink), role).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('gives every component with a dark tone that text through those roles, never the accent drawn for the light page', async () => {
    const section = await readFile(join(COMPONENTS, '_shared', 'Section.astro'), 'utf8')
    expect(section).toContain('inverse: `bg-ink text-surface [--color-accent-text:var(--color-accent-text-inverse)] ${mutedInverse}`')
    const ids = (await readdir(COMPONENTS)).filter(id => !id.startsWith('_'))
    const dark: string[] = []
    for (const id of ids) {
      const meta = JSON.parse(await readFile(join(COMPONENTS, id, 'meta.json'), 'utf8'))
      if (!meta.variants?.tone?.options?.includes('inverse')) continue
      dark.push(id)
      const sources = await Promise.all((await readdir(join(COMPONENTS, id))).filter(file => file.endsWith('.astro')).map(file => readFile(join(COMPONENTS, id, file), 'utf8')))
      const source = sources.join('\n')
      // Through Section's inverse tone (which points accent text at its inverse twin), or with no accent text of its own.
      expect(source.includes('<Section') || !source.includes('accent-text'), id).toBe(true)
      expect(source, id).not.toMatch(/\btext-accent(?![-\w])/)
    }
    expect(dark.length).toBeGreaterThan(10)
  })
})

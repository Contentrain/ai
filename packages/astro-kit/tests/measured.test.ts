import { describe, expect, it } from 'vitest'
import { measuredColumns, measuredFrame, measuredGrid, measuredSlides } from '../components/_shared/measured'

// The grammar is tested through what Section receives: only measuredFrame and measuredGrid leave the module, so a
// delivered site's knip sees no unused export.
const fill = (color: unknown) => measuredFrame({ bg: { color: color as string } }).color
const image = (src: unknown) => measuredFrame({ bg: { image: src as string } }).image?.src
const overlay = (value: string) => measuredFrame({ bg: { overlay: value } }).overlay
const cols = (columns: Record<number, unknown>) => /--kit-cols-390: (\d); --kit-cols-768: (\d); --kit-cols-1280: (\d)/.exec(measuredFrame({ columns: columns as never }).style ?? '')?.slice(1).map(Number)

describe('measured values are data, not CSS', () => {
  it('keeps fills in hex, rgb(a) and hsl(a) and drops anything else', () => {
    for (const fine of ['#fff', '#0f172a', '#0f172a80', 'rgb(15, 23, 42)', 'rgba(0, 0, 0, 0.55)', 'rgb(0 0 0 / 50%)', 'hsl(210, 40%, 20%)', 'transparent']) expect(fill(fine), fine).toBe(fine)
    for (const bad of ['red; background: url(x)', 'url(a)', 'var(--x)', 'expression(alert(1))', '#ggg', '', 12, undefined]) expect(fill(bad), String(bad)).toBeUndefined()
  })

  it('keeps http(s) and root-relative image addresses that cannot break out of a quote', () => {
    expect(image('https://example.com/a.jpg')).toBe('https://example.com/a.jpg')
    expect(image('/media/a.jpg')).toBe('/media/a.jpg')
    for (const bad of ['javascript:alert(1)', '//evil.example/a.jpg', 'data:image/png;base64,AA', '/a.jpg") ; x', "/a'.jpg", '/a b.jpg', 'a.jpg']) expect(image(bad), bad).toBeUndefined()
  })

  it('keeps overlay colours and gradients whose every stop is a colour', () => {
    expect(overlay('rgba(0, 0, 0, 0.5)')).toBe('rgba(0, 0, 0, 0.5)')
    expect(overlay('linear-gradient(180deg, rgba(0, 0, 0, 0.6) 0%, rgba(0, 0, 0, 0) 100%)')).toBe('linear-gradient(180deg, rgba(0, 0, 0, 0.6) 0%, rgba(0, 0, 0, 0) 100%)')
    expect(overlay('linear-gradient(to right, #000, transparent)')).toBe('linear-gradient(to right, #000, transparent)')
    expect(overlay('radial-gradient(circle, #fff 10%, #000 90%)')).toBe('radial-gradient(circle, #fff 10%, #000 90%)')
    for (const bad of ['linear-gradient(#000)', 'linear-gradient(180deg, url(x), #000)', 'linear-gradient(180deg, #000, #fff)); color: red; x(', 'conic-gradient(#000, #fff)', 'linear-gradient(180deg, var(--a), #000)']) expect(overlay(bad), bad).toBeUndefined()
  })

  it('reads position and size from closed sets', () => {
    const at = (position: string, size?: string) => measuredFrame({ bg: { image: '/a.jpg', position, size } }).image
    expect(at('center')?.position).toBe('center')
    expect(at('Left Top')?.position).toBe('left top')
    expect(at('50% 30%')?.position).toBe('50% 30%')
    for (const bad of ['center; color: red', 'calc(1px)', 'a b c', '10px']) expect(at(bad)?.position, bad).toBeUndefined()
    expect(at('center', 'contain')?.fit).toBe('contain')
    expect(at('center', 'auto')?.fit).toBe('none')
    expect(at('center', '100% auto')?.fit).toBe('cover')
  })

  it('tells dark fills from light ones when no tone is measured', () => {
    expect(measuredFrame({ bg: { color: '#0f172a' } }).tone).toBe('dark')
    expect(measuredFrame({ bg: { color: '#fff' } }).tone).toBe('light')
    expect(measuredFrame({ bg: { color: 'rgb(250, 250, 250)' } }).tone).toBe('light')
    expect(measuredFrame({ bg: { color: 'rgba(0, 0, 0, 0.9)' } }).tone).toBe('dark')
    expect(measuredFrame({ bg: { color: '#fafafa' }, tone: 'dark' }).tone).toBe('dark')
    expect(measuredFrame({ tone: 'dark' })).toMatchObject({ color: undefined, tone: 'dark' })
  })
})

describe('columns per width', () => {
  it('fills every width from the measured ones', () => {
    expect(cols({ 390: 1, 768: 2, 1280: 4 })).toEqual([1, 2, 4])
    expect(cols({ 1280: 3 })).toEqual([1, 2, 3])
    expect(cols({ 1280: 1 })).toEqual([1, 1, 1])
    expect(cols({ 390: 2 })).toEqual([2, 2, 2])
    expect(cols({ 768: 3 })).toEqual([1, 3, 3])
  })

  it('ignores out-of-range or non-numeric columns', () => {
    for (const bad of [{ 1280: 0 }, { 1280: 7 }, { 1280: '3' }]) expect(cols(bad), JSON.stringify(bad)).toBeUndefined()
  })
})

describe('the frame Section draws', () => {
  it('is empty without a measured style, so a section renders as before', () => {
    expect(measuredFrame(undefined)).toEqual({})
    expect(measuredGrid(undefined)).toBeUndefined()
  })

  it('turns numbers into custom properties and the section box', () => {
    const m = measuredFrame({ containerPx: 1140, padY: 96, padX: 24, columns: { 390: 1, 768: 2, 1280: 4 }, gap: 32, radius: 8, minHeight: 480 })
    expect(m.style).toBe('--kit-cols-390: 1; --kit-cols-768: 2; --kit-cols-1280: 4; --kit-gap: 32px; --radius-card: 8px; padding-block: 96px; min-height: 480px')
    expect(m.frameStyle).toBe('--container-page: 1140px; --spacing-gutter: 24px')
  })

  it('drops numbers that are not finite or out of range', () => {
    const m = measuredFrame({ containerPx: Number.NaN, padY: -1, padX: 1e9, gap: Number.POSITIVE_INFINITY, minHeight: '10px; color: red' as unknown as number })
    expect(m.style).toBeUndefined()
    expect(m.frameStyle).toBeUndefined()
  })

  it('draws an image with its fit, position and overlay', () => {
    expect(measuredFrame({ bg: { image: '/a.jpg', overlay: 'rgba(0, 0, 0, 0.5)', size: 'contain', position: 'top' } })).toMatchObject({ image: { src: '/a.jpg', fit: 'contain', position: 'top' }, overlay: 'rgba(0, 0, 0, 0.5)' })
    expect(measuredFrame({ bg: { image: '/a.jpg' } }).image).toEqual({ src: '/a.jpg', fit: 'cover', position: undefined })
  })

  it('gives a grid the measured columns and gap as literal classes', () => {
    expect(measuredGrid({ columns: { 1280: 3 }, gap: 24 })).toBe('grid-cols-[repeat(var(--kit-cols-390),minmax(0,1fr))] md:grid-cols-[repeat(var(--kit-cols-768),minmax(0,1fr))] lg:grid-cols-[repeat(var(--kit-cols-1280),minmax(0,1fr))] gap-[var(--kit-gap)] md:gap-[var(--kit-gap)]')
    expect(measuredGrid({ gap: 24 })).toBe('gap-[var(--kit-gap)] md:gap-[var(--kit-gap)]')
    expect(measuredGrid({ padY: 10 })).toBeUndefined()
  })

  it('gives a column-flowed list the measured columns, and nothing without them', () => {
    expect(measuredColumns({ columns: { 1280: 3 }, gap: 24 })).toBe('block columns-[var(--kit-cols-390)] md:columns-[var(--kit-cols-768)] lg:columns-[var(--kit-cols-1280)] gap-x-[var(--kit-gap)]')
    expect(measuredColumns({ columns: { 390: 1 } })).not.toContain('gap-x')
    expect(measuredColumns({ gap: 24 })).toBeUndefined()
    expect(measuredColumns(undefined)).toBeUndefined()
  })

  it('gives a slide row the measured slides in view and gap, and nothing without columns', () => {
    const row = measuredSlides({ columns: { 390: 1, 768: 2, 1280: 3 }, gap: 20 })
    expect(row?.slide).toContain('basis-[calc((100%-(var(--kit-cols-390)-1)*var(--kit-gap,1rem))/var(--kit-cols-390))]')
    expect(row?.slide).toContain('lg:basis-[calc((100%-(var(--kit-cols-1280)-1)*var(--kit-gap,1rem))/var(--kit-cols-1280))]')
    expect(row?.track).toBe('gap-[var(--kit-gap)]')
    expect(measuredSlides({ columns: { 1280: 2 } })?.track).toBe('')
    expect(measuredSlides({ gap: 20 })).toBeUndefined()
    expect(measuredSlides(undefined)).toBeUndefined()
  })
})

import { describe, expect, it } from 'vitest'
import { colorOf, columnsFor, fitOf, imageOf, isDark, measuredFrame, measuredGrid, positionOf } from '../components/_shared/measured'

describe('measured values are data, not CSS', () => {
  it('keeps colours in hex, rgb(a) and hsl(a) and drops anything else', () => {
    for (const fine of ['#fff', '#0f172a', '#0f172a80', 'rgb(15, 23, 42)', 'rgba(0, 0, 0, 0.55)', 'rgb(0 0 0 / 50%)', 'hsl(210, 40%, 20%)', 'transparent']) expect(colorOf(fine), fine).toBe(fine)
    for (const bad of ['red; background: url(x)', 'url(a)', 'var(--x)', 'expression(alert(1))', '#ggg', '', 12, undefined]) expect(colorOf(bad), String(bad)).toBeUndefined()
  })

  it('keeps http(s) and root-relative image addresses that cannot break out of a quote', () => {
    expect(imageOf('https://example.com/a.jpg')).toBe('https://example.com/a.jpg')
    expect(imageOf('/media/a.jpg')).toBe('/media/a.jpg')
    for (const bad of ['javascript:alert(1)', '//evil.example/a.jpg', 'data:image/png;base64,AA', '/a.jpg") ; x', "/a'.jpg", '/a b.jpg', 'a.jpg']) expect(imageOf(bad), bad).toBeUndefined()
  })

  it('reads position and size from closed sets', () => {
    expect(positionOf('center')).toBe('center')
    expect(positionOf('Left Top')).toBe('left top')
    expect(positionOf('50% 30%')).toBe('50% 30%')
    for (const bad of ['center; color: red', 'calc(1px)', 'a b c', '10px']) expect(positionOf(bad), bad).toBeUndefined()
    expect(fitOf('cover')).toBe('cover')
    expect(fitOf('auto')).toBe('none')
    expect(fitOf('100% auto')).toBeUndefined()
  })

  it('tells dark fills from light ones', () => {
    expect(isDark('#0f172a')).toBe(true)
    expect(isDark('#fff')).toBe(false)
    expect(isDark('rgb(250, 250, 250)')).toBe(false)
    expect(isDark('rgba(0, 0, 0, 0.9)')).toBe(true)
    expect(isDark('hsl(0, 0%, 0%)')).toBeUndefined()
  })
})

describe('columns per width', () => {
  it('fills every width from the measured ones', () => {
    expect(columnsFor({ 390: 1, 768: 2, 1280: 4 })).toEqual({ 390: 1, 768: 2, 1280: 4 })
    expect(columnsFor({ 1280: 3 })).toEqual({ 390: 1, 768: 2, 1280: 3 })
    expect(columnsFor({ 1280: 1 })).toEqual({ 390: 1, 768: 1, 1280: 1 })
    expect(columnsFor({ 390: 2 })).toEqual({ 390: 2, 768: 2, 1280: 2 })
    expect(columnsFor({ 768: 3 })).toEqual({ 390: 1, 768: 3, 1280: 3 })
  })

  it('ignores out-of-range or non-numeric columns', () => {
    expect(columnsFor({ 1280: 0 })).toBeUndefined()
    expect(columnsFor({ 1280: 7 })).toBeUndefined()
    expect(columnsFor({ 1280: '3' as unknown as number })).toBeUndefined()
    expect(columnsFor(undefined)).toBeUndefined()
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

  it('takes the text tone from the measure, else from the fill', () => {
    expect(measuredFrame({ bg: { color: '#0f172a' } })).toMatchObject({ color: '#0f172a', tone: 'dark' })
    expect(measuredFrame({ bg: { color: '#fafafa' } })).toMatchObject({ color: '#fafafa', tone: 'light' })
    expect(measuredFrame({ bg: { color: '#fafafa' }, tone: 'dark' })).toMatchObject({ tone: 'dark' })
    expect(measuredFrame({ tone: 'dark' })).toMatchObject({ color: undefined, tone: 'dark' })
  })

  it('draws an image with its fit, position and overlay; an overlay without an image is nothing', () => {
    expect(measuredFrame({ bg: { image: '/a.jpg', overlay: 'rgba(0, 0, 0, 0.5)', size: 'contain', position: 'top' } })).toMatchObject({ image: { src: '/a.jpg', fit: 'contain', position: 'top' }, overlay: 'rgba(0, 0, 0, 0.5)' })
    expect(measuredFrame({ bg: { image: '/a.jpg' } }).image).toEqual({ src: '/a.jpg', fit: 'cover', position: undefined })
    expect(measuredFrame({ bg: { overlay: 'rgba(0, 0, 0, 0.5)' } }).overlay).toBeUndefined()
  })

  it('gives a grid the measured columns and gap as literal classes', () => {
    expect(measuredGrid({ columns: { 1280: 3 }, gap: 24 })).toBe('grid-cols-[repeat(var(--kit-cols-390),minmax(0,1fr))] md:grid-cols-[repeat(var(--kit-cols-768),minmax(0,1fr))] lg:grid-cols-[repeat(var(--kit-cols-1280),minmax(0,1fr))] gap-[var(--kit-gap)] md:gap-[var(--kit-gap)]')
    expect(measuredGrid({ gap: 24 })).toBe('gap-[var(--kit-gap)] md:gap-[var(--kit-gap)]')
    expect(measuredGrid({ padY: 10 })).toBeUndefined()
  })
})

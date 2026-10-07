import { describe, expect, it } from 'vitest'
import { safeHref, safeSrc, safeUrl } from '../components/_shared/safe-url'

const SCRIPTS = [
  'javascript:alert(1)',
  ' JaVaScRiPt:alert(1)', // leading space, mixed case
  '\tjavascript:alert(1)',
  '\u0001javascript:alert(1)',
  'java\tscript:alert(1)',
  'java\nscript:alert(1)',
  'java\r\nscript:alert(1)',
  '&#106;avascript:alert(1)', // decimal reference
  '&#x6A;avascript:alert(1)', // hex reference
  '&#106avascript:alert(1)', // no semicolon
  'jav&#x09;ascript:alert(1)', // reference to a tab inside the scheme
  'javascript&colon;alert(1)',
  'javascript&#58;alert(1)',
  '&amp;#106;avascript:alert(1)', // twice encoded
  'JAVASCRIPT&COLON;alert(1)',
  'vbscript:msgbox(1)',
  'data:text/html,<script>alert(1)</script>',
  'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
  ' DaTa:text/html,x',
  'data:image/svg+xml,<svg onload=alert(1)>',
  'file:///etc/passwd',
  'blob:https://example.com/abc',
  'ftp://example.com/x',
  'intent://scan/#Intent;scheme=zxing;end',
]

const SAFE = [
  'https://example.com/a?b=1&c=2',
  'HTTP://EXAMPLE.COM',
  'mailto:hello@example.com?subject=Hi&body=There',
  'tel:+441234567890',
  '/',
  '/about/',
  '/search?q=a:b',
  './x',
  '../y',
  '?page=2',
  '#top',
  '//cdn.example.com/x.png',
  'about/team',
  'java script:ok', // a space is not a tab: a relative path, not a scheme
  '/a&amp;b',
  '/a&b=c',
  '',
]

describe('safeUrl', () => {
  it.each(SCRIPTS)('refuses %j', (value) => {
    expect(safeUrl(value)).toBeUndefined()
    expect(safeHref(value)).toBe('#')
    expect(safeSrc(value)).toBeUndefined()
  })

  it.each(SAFE)('keeps %j', (value) => {
    expect(safeUrl(value)).toBe(value.trim())
    expect(safeHref(value)).toBe(value.trim())
  })

  it('has nothing for nothing', () => {
    expect(safeUrl(undefined)).toBeUndefined()
    expect(safeUrl(null)).toBeUndefined()
    expect(safeHref(undefined)).toBe('#')
    expect(safeSrc(undefined)).toBeUndefined()
  })

  it('trims what it keeps', () => {
    expect(safeUrl('  https://example.com/x \n')).toBe('https://example.com/x')
  })
})

describe('safeSrc', () => {
  it('also allows an inline raster image, and nothing else under data:', () => {
    expect(safeSrc('data:image/png;base64,iVBORw0KGgo=')).toBe('data:image/png;base64,iVBORw0KGgo=')
    expect(safeSrc('data:image/webp,xyz')).toBe('data:image/webp,xyz')
    expect(safeSrc('data:image/svg+xml;base64,PHN2Zz4=')).toBeUndefined()
    expect(safeSrc('data:text/html,x')).toBeUndefined()
    expect(safeSrc('/media/a.jpg')).toBe('/media/a.jpg')
    expect(safeSrc('https://example.com/a.jpg')).toBe('https://example.com/a.jpg')
  })

  it('refuses an inline image that hides behind references or a tab', () => {
    expect(safeSrc('d&#97;ta:text/html,x')).toBeUndefined()
    expect(safeSrc('da\tta:text/html,x')).toBeUndefined()
  })

  it('href and action never get the inline image', () => {
    expect(safeUrl('data:image/png;base64,iVBORw0KGgo=')).toBeUndefined()
  })
})

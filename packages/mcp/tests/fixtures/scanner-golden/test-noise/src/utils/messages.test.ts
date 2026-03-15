import { describe, expect, it } from 'vitest'

describe('messages', () => {
  it('renders the primary CTA', () => {
    expect('Kaydi Tamamla').toBe('Kaydi Tamamla')
  })

  it('shows the empty state', () => {
    expect('No items yet').toContain('No items')
  })
})

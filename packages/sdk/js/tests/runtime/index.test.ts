import { describe, it, expect } from 'vitest'
import * as sdk from '../../src/index.js'

describe('package root exports', () => {
  it('exports createContentrainClient for framework SDK authors', () => {
    expect(typeof (sdk as Record<string, unknown>)['createContentrainClient']).toBe('function')
  })
})

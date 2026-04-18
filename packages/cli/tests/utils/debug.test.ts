import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('debug helper', () => {
  let originalEnv: string | undefined

  beforeEach(() => {
    originalEnv = process.env['CONTENTRAIN_DEBUG']
    delete process.env['CONTENTRAIN_DEBUG']
    vi.resetModules()
  })

  afterEach(() => {
    if (originalEnv === undefined) delete process.env['CONTENTRAIN_DEBUG']
    else process.env['CONTENTRAIN_DEBUG'] = originalEnv
    vi.resetModules()
  })

  it('is silent by default', async () => {
    const writeSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const mod = await import('../../src/utils/debug.js')
    mod.debug('test', 'hello')
    mod.debugJson('test', 'payload', { a: 1 })
    expect(writeSpy).not.toHaveBeenCalled()
    expect(mod.isDebug()).toBe(false)
    writeSpy.mockRestore()
  })

  it('turns on via enableDebug() and writes to stderr', async () => {
    const writeSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const mod = await import('../../src/utils/debug.js')
    mod.enableDebug()
    mod.debug('validate', 'starting')
    expect(writeSpy).toHaveBeenCalledTimes(1)
    const msg = String(writeSpy.mock.calls[0]?.[0])
    expect(msg).toContain('validate')
    expect(msg).toContain('starting')
    writeSpy.mockRestore()
  })

  it('turns on via CONTENTRAIN_DEBUG env var at import time', async () => {
    process.env['CONTENTRAIN_DEBUG'] = '1'
    const writeSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const mod = await import('../../src/utils/debug.js')
    expect(mod.isDebug()).toBe(true)
    mod.debug('env', 'on')
    expect(writeSpy).toHaveBeenCalled()
    writeSpy.mockRestore()
  })

  it('debugTimer returns a no-op when debug is off', async () => {
    const writeSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const mod = await import('../../src/utils/debug.js')
    const end = mod.debugTimer('x', 'y')
    end()
    expect(writeSpy).not.toHaveBeenCalled()
    writeSpy.mockRestore()
  })

  it('debugTimer reports elapsed ms when debug is on', async () => {
    const writeSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const mod = await import('../../src/utils/debug.js')
    mod.enableDebug()
    const end = mod.debugTimer('gen', 'write')
    end()
    expect(writeSpy).toHaveBeenCalledTimes(1)
    const msg = String(writeSpy.mock.calls[0]?.[0])
    expect(msg).toMatch(/\(\d+ms\)/u)
    writeSpy.mockRestore()
  })
})

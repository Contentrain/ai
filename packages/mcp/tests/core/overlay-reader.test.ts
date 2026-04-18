import { describe, expect, it, vi } from 'vitest'
import type { RepoReader } from '../../src/core/contracts/index.js'
import { OverlayReader } from '../../src/core/overlay-reader.js'

/**
 * OverlayReader is the primitive that guarantees the remote write path
 * commits a consistent context.json / validation result for the state
 * the pending commit produces (not the state of the pre-change base
 * branch). The tests cover the three surfaces — readFile, listDirectory,
 * fileExists — against synthesized base readers.
 */

function mockReader(overrides: Partial<RepoReader> = {}): RepoReader {
  return {
    readFile: overrides.readFile ?? vi.fn(async () => { throw new Error('no read') }),
    listDirectory: overrides.listDirectory ?? vi.fn(async () => []),
    fileExists: overrides.fileExists ?? vi.fn(async () => false),
  }
}

describe('OverlayReader.readFile', () => {
  it('returns pending content for an added path', async () => {
    const base = mockReader()
    const overlay = new OverlayReader(base, [
      { path: 'a.json', content: '{"pending":true}' },
    ])
    expect(await overlay.readFile('a.json')).toBe('{"pending":true}')
    expect(base.readFile).not.toHaveBeenCalled()
  })

  it('falls through to base reader when path is not in overlay', async () => {
    const readFile = vi.fn(async () => 'base content')
    const overlay = new OverlayReader(mockReader({ readFile }), [
      { path: 'other.json', content: '{}' },
    ])
    expect(await overlay.readFile('a.json')).toBe('base content')
    expect(readFile).toHaveBeenCalledWith('a.json', undefined)
  })

  it('throws for a path marked for deletion in the overlay', async () => {
    const overlay = new OverlayReader(mockReader(), [
      { path: 'gone.json', content: null },
    ])
    await expect(overlay.readFile('gone.json')).rejects.toThrow(/marked for deletion/)
  })

  it('normalises leading slashes when matching overlay keys', async () => {
    const overlay = new OverlayReader(mockReader(), [
      { path: 'a.json', content: 'X' },
    ])
    expect(await overlay.readFile('/a.json')).toBe('X')
  })
})

describe('OverlayReader.listDirectory', () => {
  it('returns base entries plus pending adds in the same directory', async () => {
    const listDirectory = vi.fn(async () => ['keep.json'])
    const overlay = new OverlayReader(mockReader({ listDirectory }), [
      { path: 'dir/new.json', content: '{}' },
    ])
    const names = (await overlay.listDirectory('dir')).toSorted()
    expect(names).toEqual(['keep.json', 'new.json'])
  })

  it('removes entries whose pending change is a delete', async () => {
    const listDirectory = vi.fn(async () => ['keep.json', 'gone.json'])
    const overlay = new OverlayReader(mockReader({ listDirectory }), [
      { path: 'dir/gone.json', content: null },
    ])
    expect(await overlay.listDirectory('dir')).toEqual(['keep.json'])
  })

  it('surfaces nested subdirectories when a pending change targets a file inside them', async () => {
    const listDirectory = vi.fn(async () => [])
    const overlay = new OverlayReader(mockReader({ listDirectory }), [
      { path: 'dir/sub/a.json', content: '{}' },
    ])
    expect(await overlay.listDirectory('dir')).toEqual(['sub'])
  })

  it('does not duplicate entries that exist both in base and overlay', async () => {
    const listDirectory = vi.fn(async () => ['shared.json'])
    const overlay = new OverlayReader(mockReader({ listDirectory }), [
      { path: 'dir/shared.json', content: '{"pending":true}' },
    ])
    expect(await overlay.listDirectory('dir')).toEqual(['shared.json'])
  })
})

describe('OverlayReader.fileExists', () => {
  it('returns true for a pending add even when base reader returns false', async () => {
    const base = mockReader({ fileExists: vi.fn(async () => false) })
    const overlay = new OverlayReader(base, [
      { path: 'a.json', content: '{}' },
    ])
    expect(await overlay.fileExists('a.json')).toBe(true)
  })

  it('returns false for a pending delete even when base reader returns true', async () => {
    const base = mockReader({ fileExists: vi.fn(async () => true) })
    const overlay = new OverlayReader(base, [
      { path: 'gone.json', content: null },
    ])
    expect(await overlay.fileExists('gone.json')).toBe(false)
  })

  it('delegates to the base reader for paths not in overlay', async () => {
    const fileExists = vi.fn(async () => true)
    const overlay = new OverlayReader(mockReader({ fileExists }), [])
    expect(await overlay.fileExists('any.json')).toBe(true)
    expect(fileExists).toHaveBeenCalledWith('any.json', undefined)
  })
})

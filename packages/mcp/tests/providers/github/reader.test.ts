import { describe, expect, it, vi } from 'vitest'
import type { GitHubClient } from '../../../src/providers/github/client.js'
import { GitHubReader } from '../../../src/providers/github/reader.js'

/**
 * GitHubReader unit tests — exercise the read surface against a minimal
 * mocked Octokit. The mock implements only the methods the reader
 * actually calls; anything else should be unreachable.
 */

function mockClient(
  overrides: {
    getContent?: ReturnType<typeof vi.fn>
    getBlob?: ReturnType<typeof vi.fn>
  } = {},
): GitHubClient {
  return {
    rest: {
      repos: {
        getContent: overrides.getContent ?? vi.fn(),
      },
      git: {
        getBlob: overrides.getBlob ?? vi.fn(),
      },
    },
  } as unknown as GitHubClient
}

function b64(s: string): string {
  return Buffer.from(s, 'utf-8').toString('base64')
}

describe('GitHubReader.readFile', () => {
  it('decodes base64 content for a normal file', async () => {
    const getContent = vi.fn().mockResolvedValue({
      data: {
        type: 'file',
        encoding: 'base64',
        content: b64('{"hello":"world"}'),
        size: 17,
        sha: 'abc',
      },
    })
    const reader = new GitHubReader(mockClient({ getContent }), { owner: 'o', name: 'r' })

    const content = await reader.readFile('.contentrain/config.json', 'contentrain')

    expect(content).toBe('{"hello":"world"}')
    expect(getContent).toHaveBeenCalledWith({
      owner: 'o',
      repo: 'r',
      path: '.contentrain/config.json',
      ref: 'contentrain',
    })
  })

  it('falls back to getBlob when file body is omitted (large file)', async () => {
    const getContent = vi.fn().mockResolvedValue({
      data: {
        type: 'file',
        encoding: 'none',
        content: '',
        size: 2_000_000,
        sha: 'blob-sha',
      },
    })
    const getBlob = vi.fn().mockResolvedValue({
      data: { encoding: 'base64', content: b64('big content') },
    })
    const reader = new GitHubReader(
      mockClient({ getContent, getBlob }),
      { owner: 'o', name: 'r' },
    )

    const content = await reader.readFile('big.json')
    expect(content).toBe('big content')
    expect(getBlob).toHaveBeenCalledWith({ owner: 'o', repo: 'r', file_sha: 'blob-sha' })
  })

  it('throws when path is a directory', async () => {
    const getContent = vi.fn().mockResolvedValue({ data: [{ name: 'a.json' }] })
    const reader = new GitHubReader(mockClient({ getContent }), { owner: 'o', name: 'r' })
    await expect(reader.readFile('dir')).rejects.toThrow(/directory/)
  })

  it('prefixes paths with contentRoot', async () => {
    const getContent = vi.fn().mockResolvedValue({
      data: { type: 'file', encoding: 'base64', content: b64('x'), size: 1, sha: 'a' },
    })
    const reader = new GitHubReader(
      mockClient({ getContent }),
      { owner: 'o', name: 'r', contentRoot: 'apps/web' },
    )

    await reader.readFile('.contentrain/config.json')
    expect(getContent).toHaveBeenCalledWith({
      owner: 'o',
      repo: 'r',
      path: 'apps/web/.contentrain/config.json',
      ref: undefined,
    })
  })
})

describe('GitHubReader.listDirectory', () => {
  it('returns entry names for a directory', async () => {
    const getContent = vi.fn().mockResolvedValue({
      data: [
        { name: 'en.json', type: 'file' },
        { name: 'tr.json', type: 'file' },
      ],
    })
    const reader = new GitHubReader(mockClient({ getContent }), { owner: 'o', name: 'r' })

    const names = await reader.listDirectory('.contentrain/content/blog')
    expect(names).toEqual(['en.json', 'tr.json'])
  })

  it('returns empty array when directory is missing (404)', async () => {
    const getContent = vi.fn().mockRejectedValue(Object.assign(new Error('Not Found'), { status: 404 }))
    const reader = new GitHubReader(mockClient({ getContent }), { owner: 'o', name: 'r' })
    const names = await reader.listDirectory('.contentrain/missing')
    expect(names).toEqual([])
  })

  it('returns empty array when path is a file', async () => {
    const getContent = vi.fn().mockResolvedValue({
      data: { type: 'file', encoding: 'base64', content: b64('x'), size: 1, sha: 'a' },
    })
    const reader = new GitHubReader(mockClient({ getContent }), { owner: 'o', name: 'r' })
    const names = await reader.listDirectory('some.json')
    expect(names).toEqual([])
  })

  it('propagates non-404 errors', async () => {
    const getContent = vi.fn().mockRejectedValue(Object.assign(new Error('Server Error'), { status: 500 }))
    const reader = new GitHubReader(mockClient({ getContent }), { owner: 'o', name: 'r' })
    await expect(reader.listDirectory('.contentrain/models')).rejects.toThrow(/Server Error/)
  })
})

describe('GitHubReader.fileExists', () => {
  it('returns true when getContent succeeds', async () => {
    const getContent = vi.fn().mockResolvedValue({
      data: { type: 'file', encoding: 'base64', content: b64('x'), size: 1, sha: 'a' },
    })
    const reader = new GitHubReader(mockClient({ getContent }), { owner: 'o', name: 'r' })
    expect(await reader.fileExists('any.json')).toBe(true)
  })

  it('returns false on 404', async () => {
    const getContent = vi.fn().mockRejectedValue(Object.assign(new Error('Not Found'), { status: 404 }))
    const reader = new GitHubReader(mockClient({ getContent }), { owner: 'o', name: 'r' })
    expect(await reader.fileExists('gone.json')).toBe(false)
  })

  it('propagates non-404 errors', async () => {
    const getContent = vi.fn().mockRejectedValue(Object.assign(new Error('Rate limited'), { status: 403 }))
    const reader = new GitHubReader(mockClient({ getContent }), { owner: 'o', name: 'r' })
    await expect(reader.fileExists('a.json')).rejects.toThrow(/Rate limited/)
  })
})

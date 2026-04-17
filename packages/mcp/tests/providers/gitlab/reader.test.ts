import { describe, expect, it, vi } from 'vitest'
import type { GitLabClient } from '../../../src/providers/gitlab/client.js'
import { GitLabReader } from '../../../src/providers/gitlab/reader.js'

/**
 * GitLabReader unit tests — exercise the read surface against a
 * minimal mocked gitbeaker client. The mock implements only the
 * methods the reader actually calls; anything else should be
 * unreachable.
 */

interface Mocks {
  show?: ReturnType<typeof vi.fn>
  showRaw?: ReturnType<typeof vi.fn>
  allRepositoryTrees?: ReturnType<typeof vi.fn>
  projectShow?: ReturnType<typeof vi.fn>
}

function mockClient(overrides: Mocks = {}): GitLabClient {
  return {
    RepositoryFiles: {
      show: overrides.show ?? vi.fn(),
      showRaw: overrides.showRaw ?? vi.fn(),
    },
    Repositories: {
      allRepositoryTrees: overrides.allRepositoryTrees ?? vi.fn(),
    },
    Projects: {
      show: overrides.projectShow ?? vi.fn().mockResolvedValue({ default_branch: 'main' }),
    },
  } as unknown as GitLabClient
}

function notFound(): Error {
  return Object.assign(new Error('Not Found'), { cause: { response: { status: 404 } } })
}

describe('GitLabReader.readFile', () => {
  it('returns the raw string content from showRaw', async () => {
    const showRaw = vi.fn().mockResolvedValue('{"hello":"world"}')
    const reader = new GitLabReader(
      mockClient({ showRaw }),
      { projectId: 'acme/site' },
    )

    const content = await reader.readFile('.contentrain/config.json', 'contentrain')

    expect(content).toBe('{"hello":"world"}')
    expect(showRaw).toHaveBeenCalledWith('acme/site', '.contentrain/config.json', 'contentrain')
  })

  it('decodes a Blob response to text', async () => {
    const showRaw = vi.fn().mockResolvedValue(new Blob(['blob content'], { type: 'text/plain' }))
    const reader = new GitLabReader(
      mockClient({ showRaw }),
      { projectId: 42 },
    )

    const content = await reader.readFile('any.json', 'contentrain')
    expect(content).toBe('blob content')
  })

  it('prefixes paths with contentRoot', async () => {
    const showRaw = vi.fn().mockResolvedValue('x')
    const reader = new GitLabReader(
      mockClient({ showRaw }),
      { projectId: 'group/proj', contentRoot: 'apps/web' },
    )

    await reader.readFile('.contentrain/config.json', 'contentrain')
    expect(showRaw).toHaveBeenCalledWith('group/proj', 'apps/web/.contentrain/config.json', 'contentrain')
  })

  it('resolves the default branch when no ref is provided', async () => {
    const showRaw = vi.fn().mockResolvedValue('y')
    const projectShow = vi.fn().mockResolvedValue({ default_branch: 'trunk' })
    const reader = new GitLabReader(
      mockClient({ showRaw, projectShow }),
      { projectId: 1 },
    )

    await reader.readFile('file.json')
    expect(projectShow).toHaveBeenCalledWith(1)
    expect(showRaw).toHaveBeenCalledWith(1, 'file.json', 'trunk')
  })
})

describe('GitLabReader.listDirectory', () => {
  it('returns entry names for a directory', async () => {
    const allRepositoryTrees = vi.fn().mockResolvedValue([
      { name: 'en.json', type: 'blob', path: 'dir/en.json' },
      { name: 'tr.json', type: 'blob', path: 'dir/tr.json' },
    ])
    const reader = new GitLabReader(
      mockClient({ allRepositoryTrees }),
      { projectId: 'o/r' },
    )

    const names = await reader.listDirectory('.contentrain/content/blog', 'contentrain')
    expect(names).toEqual(['en.json', 'tr.json'])
    expect(allRepositoryTrees).toHaveBeenCalledWith('o/r', {
      path: '.contentrain/content/blog',
      ref: 'contentrain',
      perPage: 100,
      recursive: false,
    })
  })

  it('returns [] on 404', async () => {
    const allRepositoryTrees = vi.fn().mockRejectedValue(notFound())
    const reader = new GitLabReader(
      mockClient({ allRepositoryTrees }),
      { projectId: 'o/r' },
    )

    expect(await reader.listDirectory('.contentrain/missing', 'contentrain')).toEqual([])
  })

  it('propagates non-404 errors', async () => {
    const allRepositoryTrees = vi.fn().mockRejectedValue(
      Object.assign(new Error('Server Error'), { cause: { response: { status: 500 } } }),
    )
    const reader = new GitLabReader(
      mockClient({ allRepositoryTrees }),
      { projectId: 'o/r' },
    )

    await expect(reader.listDirectory('.contentrain/models', 'contentrain'))
      .rejects.toThrow(/Server Error/)
  })
})

describe('GitLabReader.fileExists', () => {
  it('returns true when show succeeds (file case)', async () => {
    const show = vi.fn().mockResolvedValue({ file_path: 'a.json' })
    const reader = new GitLabReader(mockClient({ show }), { projectId: 'o/r' })
    expect(await reader.fileExists('a.json', 'contentrain')).toBe(true)
  })

  it('falls back to directory listing when the path is a directory (show 404)', async () => {
    const show = vi.fn().mockRejectedValue(notFound())
    const allRepositoryTrees = vi.fn().mockResolvedValue([
      { name: 'en.json', type: 'blob' },
    ])
    const reader = new GitLabReader(
      mockClient({ show, allRepositoryTrees }),
      { projectId: 'o/r' },
    )
    expect(await reader.fileExists('dir', 'contentrain')).toBe(true)
    expect(allRepositoryTrees).toHaveBeenCalled()
  })

  it('returns false when both show and tree lookup 404', async () => {
    const show = vi.fn().mockRejectedValue(notFound())
    const allRepositoryTrees = vi.fn().mockRejectedValue(notFound())
    const reader = new GitLabReader(
      mockClient({ show, allRepositoryTrees }),
      { projectId: 'o/r' },
    )
    expect(await reader.fileExists('missing', 'contentrain')).toBe(false)
  })

  it('returns false when tree listing resolves empty', async () => {
    const show = vi.fn().mockRejectedValue(notFound())
    const allRepositoryTrees = vi.fn().mockResolvedValue([])
    const reader = new GitLabReader(
      mockClient({ show, allRepositoryTrees }),
      { projectId: 'o/r' },
    )
    expect(await reader.fileExists('empty-dir', 'contentrain')).toBe(false)
  })

  it('propagates non-404 errors from show', async () => {
    const show = vi.fn().mockRejectedValue(
      Object.assign(new Error('Rate limited'), { cause: { response: { status: 429 } } }),
    )
    const reader = new GitLabReader(mockClient({ show }), { projectId: 'o/r' })
    await expect(reader.fileExists('any.json', 'contentrain')).rejects.toThrow(/Rate limited/)
  })
})

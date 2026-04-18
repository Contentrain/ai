import { vi } from 'vitest'

/**
 * Minimal mock of the Octokit surface `GitHubProvider` actually touches.
 * Shared across the HTTP E2E tests so each test case focuses on its
 * specific tool behaviour rather than re-implementing the mock.
 *
 * Callers seed `filesOnHead` with `{ 'repo-relative/path': 'utf8 content' }`
 * to control what `getContent` returns. Any path not in the map yields a
 * 404. The `createTree` / `createCommit` payloads are captured so tests
 * can assert on the tree entries, deleted paths (sha: null), parent SHA,
 * and message.
 */

export interface GitHubMockFixture {
  client: unknown
  capturedTree: () => { tree: Array<{ path: string, sha: string | null, mode: string, type: string }> } | undefined
  capturedCommit: () => { message: string, parents: string[], tree: string } | undefined
  createdBlobs: () => Array<{ content: string, encoding: string }>
}

export function makeGitHubMock(filesOnHead: Record<string, string>): GitHubMockFixture {
  const createdBlobs: Array<{ content: string, encoding: string }> = []
  let capturedTree: { tree: Array<{ path: string, sha: string | null, mode: string, type: string }> } | undefined
  let capturedCommit: { message: string, parents: string[], tree: string } | undefined

  const client = {
    paginate: {
      iterator: () => ({
        [Symbol.asyncIterator]() {
          return { next: async () => ({ done: true, value: undefined as never }) }
        },
      }),
    },
    rest: {
      repos: {
        get: vi.fn().mockResolvedValue({ data: { default_branch: 'contentrain' } }),
        async getContent({ path }: { path: string }) {
          if (filesOnHead[path] !== undefined) {
            return {
              data: {
                type: 'file',
                encoding: 'base64',
                content: Buffer.from(filesOnHead[path]!).toString('base64'),
                size: filesOnHead[path]!.length,
                sha: `sha-${path}`,
              },
            }
          }
          // Directory listings — return the files whose full path starts
          // with `{path}/` as `[{ name, type: 'file' }]`.
          const prefix = `${path}/`
          const children = Object.keys(filesOnHead)
            .filter(p => p.startsWith(prefix))
            .map(p => p.slice(prefix.length).split('/')[0]!)
          const unique = [...new Set(children)]
          if (unique.length > 0) {
            return { data: unique.map(name => ({ name, type: 'file' })) }
          }
          const err = Object.assign(new Error('Not Found'), { status: 404 })
          throw err
        },
      },
      git: {
        async getRef({ ref }: { ref: string }) {
          if (ref === 'heads/contentrain') return { data: { object: { sha: 'base-sha' } } }
          const err = Object.assign(new Error('Not Found'), { status: 404 })
          throw err
        },
        async getCommit() { return { data: { tree: { sha: 'base-tree-sha' } } } },
        async createBlob({ content, encoding }: { content: string, encoding: string }) {
          createdBlobs.push({ content, encoding })
          return { data: { sha: `blob-${createdBlobs.length}` } }
        },
        async createTree(input: unknown) {
          capturedTree = input as typeof capturedTree
          return { data: { sha: 'new-tree-sha' } }
        },
        async createCommit(input: unknown) {
          capturedCommit = input as typeof capturedCommit
          return {
            data: {
              sha: 'new-commit-sha',
              message: (input as { message: string }).message,
              author: { name: 'Contentrain', email: 'mcp@contentrain.io', date: '2026-04-17T12:00:00Z' },
            },
          }
        },
        async createRef() { return {} },
        async updateRef() { return {} },
      },
    },
  }

  return {
    client,
    capturedTree: () => capturedTree,
    capturedCommit: () => capturedCommit,
    createdBlobs: () => createdBlobs,
  }
}

/**
 * Standard Contentrain config used across E2E tests. Caller can override
 * fields by spreading.
 */
export function makeConfig(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: 1,
    stack: 'vue-nuxt',
    workflow: 'review',
    locales: { default: 'en', supported: ['en', 'tr'] },
    domains: ['marketing'],
    repository: { provider: 'github', owner: 'acme', name: 'site', default_branch: 'contentrain' },
    ...overrides,
  }
}

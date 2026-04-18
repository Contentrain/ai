import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { simpleGit } from 'simple-git'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { startHttpMcpServer, startHttpMcpServerWith } from '../../src/server/http/index.js'

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

function makeReadOnlyTenantProvider(label: string) {
  return {
    label,
    capabilities: {
      localWorktree: false,
      sourceRead: false,
      sourceWrite: false,
      pushRemote: false,
      branchProtection: false,
      pullRequestFallback: false,
      astScan: false,
    },
    async readFile() { throw new Error(`${label}: no reads expected`) },
    async listDirectory() { return [] },
    async fileExists() { return false },
  }
}

let testDir: string

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), 'cr-http-mcp-'))
  const git = simpleGit(testDir)
  await git.init()
  await git.addConfig('user.name', 'Test')
  await git.addConfig('user.email', 'test@contentrain.io')
  await writeFile(join(testDir, '.gitkeep'), '')
  await git.add('.')
  await git.commit('initial')
})

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true })
})

function parseResult(result: unknown): Record<string, unknown> {
  const content = (result as { content: Array<{ text: string }> }).content
  return JSON.parse(content[0]!.text) as Record<string, unknown>
}

describe('startHttpMcpServer', () => {
  it('serves contentrain_describe_format over HTTP end-to-end', async () => {
    const handle = await startHttpMcpServer({ projectRoot: testDir, port: 0 })
    try {
      const client = new Client({ name: 'test-http-client', version: '1.0.0' })
      const transport = new StreamableHTTPClientTransport(new URL(handle.url))
      await client.connect(transport)

      try {
        const result = await client.callTool({
          name: 'contentrain_describe_format',
          arguments: {},
        })
        const parsed = parseResult(result)
        expect(parsed['overview']).toBeDefined()
      } finally {
        await client.close()
      }
    } finally {
      await handle.close()
    }
  })

  it('rejects tool calls without Bearer token when authToken is set', async () => {
    const handle = await startHttpMcpServer({ projectRoot: testDir, port: 0, authToken: 'secret' })
    try {
      const client = new Client({ name: 'test-http-client', version: '1.0.0' })
      const transport = new StreamableHTTPClientTransport(new URL(handle.url))

      await expect(client.connect(transport)).rejects.toThrow()
    } finally {
      await handle.close()
    }
  })

  it('accepts tool calls with matching Bearer token', async () => {
    const handle = await startHttpMcpServer({ projectRoot: testDir, port: 0, authToken: 'secret' })
    try {
      const client = new Client({ name: 'test-http-client', version: '1.0.0' })
      const transport = new StreamableHTTPClientTransport(new URL(handle.url), {
        requestInit: { headers: { Authorization: 'Bearer secret' } },
      })
      await client.connect(transport)

      try {
        const result = await client.callTool({
          name: 'contentrain_describe_format',
          arguments: {},
        })
        expect(parseResult(result)['overview']).toBeDefined()
      } finally {
        await client.close()
      }
    } finally {
      await handle.close()
    }
  })

  it('404s for requests outside the MCP mount path', async () => {
    const handle = await startHttpMcpServer({ projectRoot: testDir, port: 0 })
    try {
      const outsideUrl = handle.url.replace(/\/mcp$/, '/some-other-path')
      const response = await fetch(outsideUrl, { method: 'POST' })
      expect(response.status).toBe(404)
    } finally {
      await handle.close()
    }
  })

  // ─── Phase 5.3: provider threading ───
  // createServer now accepts `{ provider, projectRoot }` so HTTP handlers can
  // route to a non-local provider. Today the write path still needs
  // projectRoot; read-only static tools (describe_format) work regardless of
  // which provider is used. Phase 5.4 opens the write path to remote providers.

  it('serves describe_format when only a provider is configured (no projectRoot)', async () => {
    // Synthetic read-only provider — no projectRoot, implements the
    // minimum ToolProvider surface (RepoReader + capabilities). describe_format
    // must still succeed because it does not touch disk.
    const readOnlyProvider = {
      capabilities: {
        localWorktree: false,
        sourceRead: false,
        sourceWrite: false,
        pushRemote: false,
        branchProtection: false,
        pullRequestFallback: false,
        astScan: false,
      },
      async readFile() { throw new Error('no reads expected') },
      async listDirectory() { return [] },
      async fileExists() { return false },
    }

    const handle = await startHttpMcpServerWith({ provider: readOnlyProvider, port: 0 })
    try {
      const client = new Client({ name: 'test-http-client', version: '1.0.0' })
      const transport = new StreamableHTTPClientTransport(new URL(handle.url))
      await client.connect(transport)

      try {
        const result = await client.callTool({
          name: 'contentrain_describe_format',
          arguments: {},
        })
        const parsed = parseResult(result)
        expect(parsed['overview']).toBeDefined()
      } finally {
        await client.close()
      }
    } finally {
      await handle.close()
    }
  })

  it('commits content_save through a GitHubProvider-like remote provider', async () => {
    // Seed the in-memory GitHub by pre-populating config + model read responses.
    const models: Record<string, unknown> = {
      blog: {
        id: 'blog',
        name: 'Blog',
        kind: 'collection',
        domain: 'marketing',
        i18n: true,
        fields: { title: { type: 'string', required: true }, body: { type: 'text' } },
      },
    }
    const config = {
      version: 1,
      stack: 'vue-nuxt',
      workflow: 'review',
      locales: { default: 'en', supported: ['en', 'tr'] },
      domains: ['marketing'],
      repository: { provider: 'github', owner: 'acme', name: 'site', default_branch: 'contentrain' },
    }
    const filesOnHead: Record<string, string> = {
      '.contentrain/config.json': JSON.stringify(config),
      '.contentrain/models/blog.json': JSON.stringify(models['blog']),
    }

    // Minimal Octokit surface — only the methods the provider actually calls.
    const createdBlobs: Array<{ content: string, encoding: string }> = []
    let capturedTree: unknown
    let capturedCommit: unknown
    const client = {
      paginate: {
        iterator: () => ({ [Symbol.asyncIterator]() { return { next: async () => ({ done: true, value: undefined as never }) } } }),
      },
      rest: {
        repos: {
          get: vi.fn().mockResolvedValue({ data: { default_branch: 'contentrain' } }),
          async getContent({ path }: { path: string }) {
            if (filesOnHead[path]) {
              return { data: { type: 'file', encoding: 'base64', content: Buffer.from(filesOnHead[path]!).toString('base64'), size: filesOnHead[path]!.length, sha: `sha-${path}` } }
            }
            if (path.endsWith('.contentrain/models')) {
              return { data: [{ name: 'blog.json', type: 'file' }] }
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
          async createTree(input: unknown) { capturedTree = input; return { data: { sha: 'new-tree-sha' } } },
          async createCommit(input: unknown) {
            capturedCommit = input
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

    const { GitHubProvider } = await import('../../src/providers/github/index.js')
    const provider = new GitHubProvider(client as unknown as import('../../src/providers/github/client.js').GitHubClient, { owner: 'acme', name: 'site' })

    const handle = await startHttpMcpServerWith({ provider, port: 0 })
    try {
      const mcpClient = new Client({ name: 'test-http-client', version: '1.0.0' })
      const transport = new StreamableHTTPClientTransport(new URL(handle.url))
      await mcpClient.connect(transport)

      try {
        const result = await mcpClient.callTool({
          name: 'contentrain_content_save',
          arguments: {
            model: 'blog',
            entries: [{ id: 'abc123def456', locale: 'en', data: { title: 'Hello', body: 'World' } }],
          },
        })
        const parsed = parseResult(result)
        expect(parsed['status']).toBe('committed')
        const git = parsed['git'] as Record<string, unknown>
        expect(git['action']).toBe('pending-review')
        expect(git['commit']).toBe('new-commit-sha')
        // Commit is addressed to the feature branch, not the base.
        expect((git['branch'] as string).startsWith('cr/content/blog')).toBe(true)
        // The tree payload contains our content blob + meta blob + context.json blob.
        const tree = (capturedTree as { tree: Array<{ path: string }> }).tree
        const paths = tree.map(t => t.path)
        expect(paths).toContain('.contentrain/content/marketing/blog/en.json')
        expect(paths).toContain('.contentrain/meta/blog/en.json')
        expect(paths).toContain('.contentrain/context.json')
        // Commit parent resolved from contentrain branch (branchExists: false,
        // so we end up creating a new ref).
        expect((capturedCommit as { parents: string[] }).parents).toEqual(['base-sha'])
      } finally {
        await mcpClient.close()
      }
    } finally {
      await handle.close()
    }
  })

  it('commits content_save through a GitLabProvider-like remote provider', async () => {
    // Seed the in-memory GitLab with config + model read responses.
    const models: Record<string, unknown> = {
      blog: {
        id: 'blog',
        name: 'Blog',
        kind: 'collection',
        domain: 'marketing',
        i18n: true,
        fields: { title: { type: 'string', required: true }, body: { type: 'text' } },
      },
    }
    const config = {
      version: 1,
      stack: 'vue-nuxt',
      workflow: 'review',
      locales: { default: 'en', supported: ['en', 'tr'] },
      domains: ['marketing'],
      repository: { provider: 'gitlab', owner: 'acme', name: 'site', default_branch: 'contentrain' },
    }
    const filesOnHead: Record<string, string> = {
      '.contentrain/config.json': JSON.stringify(config),
      '.contentrain/models/blog.json': JSON.stringify(models['blog']),
    }

    // Capture the Commits.create payload for the content save.
    let capturedCommitsCall: { projectId: string | number, branch: string, message: string, actions: unknown[], options: Record<string, unknown> } | undefined

    const gitlabClient = {
      RepositoryFiles: {
        async show(_projectId: string | number, filePath: string, _ref: string) {
          if (filesOnHead[filePath]) return { file_path: filePath }
          const err = Object.assign(new Error('Not Found'), { cause: { response: { status: 404 } } })
          throw err
        },
        async showRaw(_projectId: string | number, filePath: string, _ref: string) {
          if (filesOnHead[filePath]) return filesOnHead[filePath]!
          const err = Object.assign(new Error('Not Found'), { cause: { response: { status: 404 } } })
          throw err
        },
      },
      Repositories: {
        async allRepositoryTrees(_projectId: string | number, opts: { path?: string }) {
          // Minimal tree: `.contentrain/models` contains blog.json; everything else empty.
          if (opts.path === '.contentrain/models') return [{ name: 'blog.json', type: 'blob' }]
          return []
        },
      },
      Projects: {
        async show() { return { default_branch: 'contentrain' } },
      },
      Branches: {
        async show() {
          const err = Object.assign(new Error('Not Found'), { cause: { response: { status: 404 } } })
          throw err
        },
      },
      Commits: {
        async create(projectId: string | number, branch: string, message: string, actions: unknown[], options: Record<string, unknown>) {
          capturedCommitsCall = { projectId, branch, message, actions, options }
          return {
            id: 'gitlab-commit-sha',
            message,
            author_name: 'Contentrain',
            author_email: 'mcp@contentrain.io',
            created_at: '2026-04-17T12:00:00Z',
          }
        },
      },
    }

    const { GitLabProvider } = await import('../../src/providers/gitlab/index.js')
    const provider = new GitLabProvider(
      gitlabClient as unknown as import('../../src/providers/gitlab/client.js').GitLabClient,
      { projectId: 'acme/site' },
    )

    const handle = await startHttpMcpServerWith({ provider, port: 0 })
    try {
      const mcpClient = new Client({ name: 'test-http-client', version: '1.0.0' })
      const transport = new StreamableHTTPClientTransport(new URL(handle.url))
      await mcpClient.connect(transport)

      try {
        const result = await mcpClient.callTool({
          name: 'contentrain_content_save',
          arguments: {
            model: 'blog',
            entries: [{ id: 'abc123def456', locale: 'en', data: { title: 'Hello', body: 'World' } }],
          },
        })
        const parsed = parseResult(result)
        expect(parsed['status']).toBe('committed')
        const git = parsed['git'] as Record<string, unknown>
        expect(git['action']).toBe('pending-review')
        expect(git['commit']).toBe('gitlab-commit-sha')
        expect((git['branch'] as string).startsWith('cr/content/blog')).toBe(true)

        // One Commits.create call with content + meta + context.json actions.
        expect(capturedCommitsCall).toBeDefined()
        const actions = capturedCommitsCall!.actions as Array<{ filePath: string, action: string }>
        const paths = actions.map(a => a.filePath)
        expect(paths).toContain('.contentrain/content/marketing/blog/en.json')
        expect(paths).toContain('.contentrain/meta/blog/en.json')
        expect(paths).toContain('.contentrain/context.json')
        // startBranch is used because the feature branch does not exist yet.
        expect(capturedCommitsCall!.options.startBranch).toBe('contentrain')
      } finally {
        await mcpClient.close()
      }
    } finally {
      await handle.close()
    }
  })

  it('commits content_delete through a GitHubProvider-like remote provider', async () => {
    const { makeGitHubMock, makeConfig } = await import('./fixtures/github-mock.js')
    const { GitHubProvider } = await import('../../src/providers/github/index.js')

    const model = {
      id: 'blog',
      name: 'Blog',
      kind: 'collection',
      domain: 'marketing',
      i18n: true,
      fields: { title: { type: 'string', required: true } },
    }
    const config = makeConfig()
    const filesOnHead: Record<string, string> = {
      '.contentrain/config.json': JSON.stringify(config),
      '.contentrain/models/blog.json': JSON.stringify(model),
      '.contentrain/content/marketing/blog/en.json': JSON.stringify({
        abc123def456: { title: 'Hello' },
      }),
      '.contentrain/meta/blog/en.json': JSON.stringify({
        abc123def456: { status: 'draft' },
      }),
    }
    const fixture = makeGitHubMock(filesOnHead)

    const provider = new GitHubProvider(
      fixture.client as unknown as import('../../src/providers/github/client.js').GitHubClient,
      { owner: 'acme', name: 'site' },
    )
    const handle = await startHttpMcpServerWith({ provider, port: 0 })
    try {
      const mcpClient = new Client({ name: 'test-http-client', version: '1.0.0' })
      const transport = new StreamableHTTPClientTransport(new URL(handle.url))
      await mcpClient.connect(transport)

      try {
        const result = await mcpClient.callTool({
          name: 'contentrain_content_delete',
          arguments: {
            model: 'blog',
            id: 'abc123def456',
            locale: 'en',
            confirm: true,
          },
        })
        const parsed = parseResult(result)
        expect(parsed['status']).toBe('committed')
        const git = parsed['git'] as Record<string, unknown>
        expect(git['action']).toBe('pending-review')
        expect((git['branch'] as string).startsWith('cr/content/blog')).toBe(true)

        const tree = fixture.capturedTree()!.tree
        const paths = tree.map(t => t.path)
        expect(paths).toContain('.contentrain/context.json')
        // The content entry is removed from the object-map; the file is
        // rewritten (not deleted) because other entries may still live
        // there in real flows. The meta file loses the corresponding
        // entry too.
        const contentEntry = tree.find(t => t.path === '.contentrain/content/marketing/blog/en.json')
        expect(contentEntry).toBeDefined()
        expect(contentEntry!.sha).not.toBeNull()
      } finally {
        await mcpClient.close()
      }
    } finally {
      await handle.close()
    }
  })

  it('commits model_save through a GitHubProvider-like remote provider', async () => {
    const { makeGitHubMock, makeConfig } = await import('./fixtures/github-mock.js')
    const { GitHubProvider } = await import('../../src/providers/github/index.js')

    const filesOnHead: Record<string, string> = {
      '.contentrain/config.json': JSON.stringify(makeConfig()),
    }
    const fixture = makeGitHubMock(filesOnHead)

    const provider = new GitHubProvider(
      fixture.client as unknown as import('../../src/providers/github/client.js').GitHubClient,
      { owner: 'acme', name: 'site' },
    )
    const handle = await startHttpMcpServerWith({ provider, port: 0 })
    try {
      const mcpClient = new Client({ name: 'test-http-client', version: '1.0.0' })
      const transport = new StreamableHTTPClientTransport(new URL(handle.url))
      await mcpClient.connect(transport)

      try {
        const result = await mcpClient.callTool({
          name: 'contentrain_model_save',
          arguments: {
            id: 'hero',
            name: 'Hero',
            kind: 'singleton',
            domain: 'marketing',
            i18n: true,
            fields: { title: { type: 'string', required: true } },
          },
        })
        const parsed = parseResult(result)
        expect(parsed['status']).toBe('committed')
        expect(parsed['model']).toBe('hero')
        const git = parsed['git'] as Record<string, unknown>
        expect(git['action']).toBe('pending-review')
        expect((git['branch'] as string).startsWith('cr/model/hero')).toBe(true)

        const tree = fixture.capturedTree()!.tree
        const paths = tree.map(t => t.path)
        expect(paths).toContain('.contentrain/models/hero.json')
        expect(paths).toContain('.contentrain/context.json')
      } finally {
        await mcpClient.close()
      }
    } finally {
      await handle.close()
    }
  })

  it('commits model_delete through a GitHubProvider-like remote provider', async () => {
    const { makeGitHubMock, makeConfig } = await import('./fixtures/github-mock.js')
    const { GitHubProvider } = await import('../../src/providers/github/index.js')

    const model = {
      id: 'blog',
      name: 'Blog',
      kind: 'collection',
      domain: 'marketing',
      i18n: true,
      fields: { title: { type: 'string', required: true } },
    }
    const filesOnHead: Record<string, string> = {
      '.contentrain/config.json': JSON.stringify(makeConfig()),
      '.contentrain/models/blog.json': JSON.stringify(model),
      '.contentrain/content/marketing/blog/en.json': '{}',
    }
    const fixture = makeGitHubMock(filesOnHead)

    const provider = new GitHubProvider(
      fixture.client as unknown as import('../../src/providers/github/client.js').GitHubClient,
      { owner: 'acme', name: 'site' },
    )
    const handle = await startHttpMcpServerWith({ provider, port: 0 })
    try {
      const mcpClient = new Client({ name: 'test-http-client', version: '1.0.0' })
      const transport = new StreamableHTTPClientTransport(new URL(handle.url))
      await mcpClient.connect(transport)

      try {
        const result = await mcpClient.callTool({
          name: 'contentrain_model_delete',
          arguments: { model: 'blog', confirm: true },
        })
        const parsed = parseResult(result)
        expect(parsed['status']).toBe('committed')
        expect(parsed['deleted']).toBe(true)
        const git = parsed['git'] as Record<string, unknown>
        expect(git['action']).toBe('pending-review')
        expect((git['branch'] as string).startsWith('cr/model/blog')).toBe(true)

        const tree = fixture.capturedTree()!.tree
        const modelEntry = tree.find(t => t.path === '.contentrain/models/blog.json')
        // Deletion is expressed as sha: null in the GitHub Git Data API.
        expect(modelEntry).toBeDefined()
        expect(modelEntry!.sha).toBeNull()
      } finally {
        await mcpClient.close()
      }
    } finally {
      await handle.close()
    }
  })

  it('runs contentrain_validate read-only over a GitHubProvider-like remote provider', async () => {
    const { makeGitHubMock, makeConfig } = await import('./fixtures/github-mock.js')
    const { GitHubProvider } = await import('../../src/providers/github/index.js')

    const model = {
      id: 'blog',
      name: 'Blog',
      kind: 'collection',
      domain: 'marketing',
      i18n: true,
      fields: { title: { type: 'string', required: true } },
    }
    const filesOnHead: Record<string, string> = {
      '.contentrain/config.json': JSON.stringify(makeConfig()),
      '.contentrain/models/blog.json': JSON.stringify(model),
      '.contentrain/content/marketing/blog/en.json': JSON.stringify({
        abc123def456: { title: 'Hello' },
      }),
      '.contentrain/content/marketing/blog/tr.json': JSON.stringify({
        abc123def456: { title: 'Merhaba' },
      }),
      '.contentrain/meta/blog/en.json': JSON.stringify({
        abc123def456: { status: 'draft' },
      }),
      '.contentrain/meta/blog/tr.json': JSON.stringify({
        abc123def456: { status: 'draft' },
      }),
    }
    const fixture = makeGitHubMock(filesOnHead)

    const provider = new GitHubProvider(
      fixture.client as unknown as import('../../src/providers/github/client.js').GitHubClient,
      { owner: 'acme', name: 'site' },
    )
    const handle = await startHttpMcpServerWith({ provider, port: 0 })
    try {
      const mcpClient = new Client({ name: 'test-http-client', version: '1.0.0' })
      const transport = new StreamableHTTPClientTransport(new URL(handle.url))
      await mcpClient.connect(transport)

      try {
        const result = await mcpClient.callTool({
          name: 'contentrain_validate',
          arguments: {},
        })
        const parsed = parseResult(result)
        expect(parsed['status']).toBe('validated')
        expect(parsed).toHaveProperty('summary')
        // Read-only: no commit was produced.
        expect(fixture.capturedCommit()).toBeUndefined()
      } finally {
        await mcpClient.close()
      }
    } finally {
      await handle.close()
    }
  })

  it('returns capability error for local-only tools on a remote provider (submit requires localWorktree)', async () => {
    const readOnlyProvider = {
      capabilities: {
        localWorktree: false,
        sourceRead: false,
        sourceWrite: false,
        pushRemote: false,
        branchProtection: false,
        pullRequestFallback: false,
        astScan: false,
      },
      async readFile() { throw new Error('no reads expected') },
      async listDirectory() { return [] },
      async fileExists() { return false },
    }

    const handle = await startHttpMcpServerWith({ provider: readOnlyProvider, port: 0 })
    try {
      const client = new Client({ name: 'test-http-client', version: '1.0.0' })
      const transport = new StreamableHTTPClientTransport(new URL(handle.url))
      await client.connect(transport)

      try {
        // contentrain_submit ships feature branches to remote via simple-git
        // — it truly needs a local worktree and rejects uniformly when the
        // session's provider can't offer one.
        const result = await client.callTool({
          name: 'contentrain_submit',
          arguments: {},
        })
        const parsed = parseResult(result)
        expect(parsed['capability_required']).toBe('localWorktree')
        expect(result.isError).toBe(true)
      } finally {
        await client.close()
      }
    } finally {
      await handle.close()
    }
  })

  it('status works read-only over a remote provider (no localWorktree rejection)', async () => {
    const { makeGitHubMock, makeConfig } = await import('./fixtures/github-mock.js')
    const { GitHubProvider } = await import('../../src/providers/github/index.js')

    const committedContext = {
      version: '1',
      lastOperation: {
        tool: 'contentrain_content_save',
        model: 'blog',
        locale: 'en',
        timestamp: '2026-04-17T12:00:00.000Z',
        source: 'mcp-studio',
      },
      stats: {
        models: 1,
        entries: 3,
        locales: ['en', 'tr'],
        lastSync: '2026-04-17T12:00:00.000Z',
      },
    }
    const filesOnHead: Record<string, string> = {
      '.contentrain/config.json': JSON.stringify(makeConfig()),
      '.contentrain/context.json': JSON.stringify(committedContext),
    }
    const fixture = makeGitHubMock(filesOnHead)
    const provider = new GitHubProvider(
      fixture.client as unknown as import('../../src/providers/github/client.js').GitHubClient,
      { owner: 'acme', name: 'site' },
    )
    const handle = await startHttpMcpServerWith({ provider, port: 0 })
    try {
      const mcpClient = new Client({ name: 'test-http-client', version: '1.0.0' })
      const transport = new StreamableHTTPClientTransport(new URL(handle.url))
      await mcpClient.connect(transport)

      try {
        const result = await mcpClient.callTool({
          name: 'contentrain_status',
          arguments: {},
        })
        const parsed = parseResult(result)
        expect(parsed['initialized']).toBe(true)
        // No capability_required key — status worked through the reader.
        expect(parsed).not.toHaveProperty('capability_required')
        // Branch health is local-only and is skipped for remote providers.
        expect(parsed).not.toHaveProperty('branches')
        // Remote reads pick up the committed .contentrain/context.json
        // through the provider — no longer hardcoded to null.
        const context = parsed['context'] as Record<string, unknown>
        expect(context).toBeDefined()
        const lastOp = context['lastOperation'] as Record<string, unknown>
        expect(lastOp['tool']).toBe('contentrain_content_save')
        expect(lastOp['model']).toBe('blog')
        const stats = context['stats'] as Record<string, unknown>
        expect(stats['entries']).toBe(3)
      } finally {
        await mcpClient.close()
      }
    } finally {
      await handle.close()
    }
  })

  // ─── 1.4.0: per-request provider resolver ───
  // Studio MCP Cloud hosts one HTTP endpoint serving many projects.
  // Each session's provider must be resolved from the inbound request
  // (usually by a workspace or project identifier) rather than baked in
  // at boot. The resolver runs exactly once per session; subsequent
  // requests with the same Mcp-Session-Id reuse the resolved server.

  it('invokes resolveProvider once per session and isolates provider state between sessions', async () => {
    const alpha = makeReadOnlyTenantProvider('alpha')
    const bravo = makeReadOnlyTenantProvider('bravo')
    const resolveSpy = vi.fn((req: { headers: Record<string, string | string[] | undefined> }) => {
      const header = req.headers['x-project-id']
      const projectId = Array.isArray(header) ? header[0] : header
      if (projectId === 'alpha') return alpha
      if (projectId === 'bravo') return bravo
      throw new Error(`unknown project: ${String(projectId)}`)
    })

    const handle = await startHttpMcpServerWith({
      resolveProvider: resolveSpy,
      port: 0,
    })
    try {
      const clientAlpha = new Client({ name: 'alpha-client', version: '1.0.0' })
      const transportAlpha = new StreamableHTTPClientTransport(new URL(handle.url), {
        requestInit: { headers: { 'x-project-id': 'alpha' } },
      })
      await clientAlpha.connect(transportAlpha)

      const clientBravo = new Client({ name: 'bravo-client', version: '1.0.0' })
      const transportBravo = new StreamableHTTPClientTransport(new URL(handle.url), {
        requestInit: { headers: { 'x-project-id': 'bravo' } },
      })
      await clientBravo.connect(transportBravo)

      try {
        // describe_format is a static read-only tool — it does not hit
        // the provider, but proving it works through both sessions
        // confirms the two sessions are wired correctly.
        const alphaResult = await clientAlpha.callTool({ name: 'contentrain_describe_format', arguments: {} })
        const bravoResult = await clientBravo.callTool({ name: 'contentrain_describe_format', arguments: {} })
        expect(parseResult(alphaResult)['overview']).toBeDefined()
        expect(parseResult(bravoResult)['overview']).toBeDefined()

        // Resolver was called exactly once per session, with each
        // request's headers distinguishing the target project.
        expect(resolveSpy).toHaveBeenCalledTimes(2)
        const calledWithHeaders = resolveSpy.mock.calls.map(c =>
          (c[0] as { headers: Record<string, string> }).headers['x-project-id'],
        )
        expect(calledWithHeaders).toEqual(expect.arrayContaining(['alpha', 'bravo']))
      } finally {
        await clientAlpha.close()
        await clientBravo.close()
      }
    } finally {
      await handle.close()
    }
  })

  it('rejects resolver failures with a 500 instead of hanging the request', async () => {
    const handle = await startHttpMcpServerWith({
      resolveProvider: () => { throw new Error('tenant not found') },
      port: 0,
    })
    try {
      const response = await fetch(handle.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
      })
      expect(response.status).toBe(500)
      const body = await response.json() as { error: string, message: string }
      expect(body.message).toContain('tenant not found')
    } finally {
      await handle.close()
    }
  })

  it('single-provider mode still works and exposes the shared McpServer on handle.mcp', async () => {
    const provider = {
      capabilities: {
        localWorktree: false,
        sourceRead: false,
        sourceWrite: false,
        pushRemote: false,
        branchProtection: false,
        pullRequestFallback: false,
        astScan: false,
      },
      async readFile() { throw new Error('no reads') },
      async listDirectory() { return [] },
      async fileExists() { return false },
    }
    const handle = await startHttpMcpServerWith({ provider, port: 0 })
    try {
      expect(handle.mcp).not.toBeNull()
    } finally {
      await handle.close()
    }
  })
})

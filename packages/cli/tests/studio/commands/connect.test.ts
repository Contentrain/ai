import { describe, it, expect, vi, afterEach } from 'vitest'

vi.mock('../../../src/studio/client.js', () => ({
  resolveStudioClient: vi.fn().mockResolvedValue({
    listWorkspaces: vi.fn().mockResolvedValue([
      { id: 'ws-1', name: 'Acme Corp', slug: 'acme', plan: 'pro', role: 'owner' },
    ]),
    listGitHubInstallations: vi.fn().mockResolvedValue([
      { id: 1, accountLogin: 'acme', accountType: 'Organization', avatarUrl: null, appSlug: 'contentrain' },
    ]),
    listGitHubRepos: vi.fn().mockResolvedValue([
      { id: 100, fullName: 'acme/website', private: false, defaultBranch: 'main', htmlUrl: 'https://github.com/acme/website' },
    ]),
    scanRepository: vi.fn().mockResolvedValue({
      hasContentrain: true,
      models: ['blog-posts'],
      locales: ['en'],
      configPath: '.contentrain/config.json',
    }),
    createProject: vi.fn().mockResolvedValue({
      id: 'proj-new',
      name: 'website',
      slug: 'website',
      stack: 'nuxt',
      repositoryUrl: 'https://github.com/acme/website',
      memberCount: 1,
    }),
  }),
}))

vi.mock('../../../src/studio/auth/credential-store.js', () => ({
  saveDefaults: vi.fn().mockResolvedValue(undefined),
  loadCredentials: vi.fn().mockResolvedValue({
    studioUrl: 'https://studio.test.io',
    accessToken: 'test-token',
    refreshToken: 'test-refresh',
    expiresAt: '2040-01-01T00:00:00Z',
  }),
}))

vi.mock('../../../src/studio/auth/oauth-server.js', () => ({
  startOAuthServer: vi.fn(),
}))

vi.mock('../../../src/utils/browser.js', () => ({
  openBrowser: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('simple-git', () => ({
  simpleGit: vi.fn().mockReturnValue({
    getRemotes: vi.fn().mockResolvedValue([
      { name: 'origin', refs: { fetch: 'https://github.com/acme/website.git', push: 'https://github.com/acme/website.git' } },
    ]),
  }),
}))

vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  log: { message: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
  spinner: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
  select: vi.fn().mockResolvedValue('ws-1'),
  confirm: vi.fn().mockResolvedValue(true),
  isCancel: vi.fn().mockReturnValue(false),
  text: vi.fn().mockResolvedValue('website'),
}))

describe('studio connect command', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('module loads and has correct metadata', async () => {
    const mod = await import('../../../src/studio/commands/connect.js')
    expect(mod.default).toBeDefined()
    expect(mod.default.meta?.name).toBe('connect')
  })

  it('supports --workspace and --json args', async () => {
    const mod = await import('../../../src/studio/commands/connect.js')
    expect(mod.default.args?.workspace?.type).toBe('string')
    expect(mod.default.args?.json?.type).toBe('boolean')
  })

  it('outputs valid JSON in json mode', async () => {
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    const mod = await import('../../../src/studio/commands/connect.js')
    await mod.default.run?.({ args: { json: true } } as Parameters<NonNullable<typeof mod.default.run>>[0])

    expect(writeSpy).toHaveBeenCalled()
    const output = JSON.parse(String(writeSpy.mock.calls.at(-1)?.[0] ?? '{}')) as Record<string, unknown>

    expect(output['workspace']).toBeDefined()
    expect(output['project']).toBeDefined()
    expect(output['repository']).toBe('acme/website')

    writeSpy.mockRestore()
  })
})

describe('parseGitHubRepoFromUrl', () => {
  it('parses HTTPS URLs with .git suffix', async () => {
    const { parseGitHubRepoFromUrl } = await import('../../../src/studio/commands/connect.js')
    expect(parseGitHubRepoFromUrl('https://github.com/owner/repo.git')).toBe('owner/repo')
  })

  it('parses HTTPS URLs without .git suffix', async () => {
    const { parseGitHubRepoFromUrl } = await import('../../../src/studio/commands/connect.js')
    expect(parseGitHubRepoFromUrl('https://github.com/owner/repo')).toBe('owner/repo')
  })

  it('parses SSH URLs', async () => {
    const { parseGitHubRepoFromUrl } = await import('../../../src/studio/commands/connect.js')
    expect(parseGitHubRepoFromUrl('git@github.com:owner/repo.git')).toBe('owner/repo')
  })

  it('parses SSH URLs without .git suffix', async () => {
    const { parseGitHubRepoFromUrl } = await import('../../../src/studio/commands/connect.js')
    expect(parseGitHubRepoFromUrl('git@github.com:owner/repo')).toBe('owner/repo')
  })

  it('returns null for non-GitHub URLs', async () => {
    const { parseGitHubRepoFromUrl } = await import('../../../src/studio/commands/connect.js')
    expect(parseGitHubRepoFromUrl('https://gitlab.com/owner/repo')).toBeNull()
  })

  it('returns null for invalid URLs', async () => {
    const { parseGitHubRepoFromUrl } = await import('../../../src/studio/commands/connect.js')
    expect(parseGitHubRepoFromUrl('not-a-url')).toBeNull()
  })
})

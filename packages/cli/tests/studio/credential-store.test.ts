import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { join } from 'node:path'
import { mkdtemp, rm, stat, chmod, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'

// Use real filesystem — integration-style test for credential security
describe('credential-store', () => {
  let testDir: string
  let originalHome: string | undefined
  let originalToken: string | undefined
  let originalUrl: string | undefined

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'cr-cred-'))
    originalHome = process.env['HOME']
    originalToken = process.env['CONTENTRAIN_STUDIO_TOKEN']
    originalUrl = process.env['CONTENTRAIN_STUDIO_URL']

    // Point homedir to temp directory
    process.env['HOME'] = testDir
    delete process.env['CONTENTRAIN_STUDIO_TOKEN']
    delete process.env['CONTENTRAIN_STUDIO_URL']
  })

  afterEach(async () => {
    process.env['HOME'] = originalHome
    if (originalToken !== undefined) {
      process.env['CONTENTRAIN_STUDIO_TOKEN'] = originalToken
    } else {
      delete process.env['CONTENTRAIN_STUDIO_TOKEN']
    }
    if (originalUrl !== undefined) {
      process.env['CONTENTRAIN_STUDIO_URL'] = originalUrl
    } else {
      delete process.env['CONTENTRAIN_STUDIO_URL']
    }

    await rm(testDir, { recursive: true, force: true })
    vi.resetModules()
  })

  it('getCredentialsPath returns path under home directory', async () => {
    const { getCredentialsPath } = await import('../../src/studio/auth/credential-store.js')
    const path = getCredentialsPath()
    expect(path).toContain('.contentrain')
    expect(path).toContain('credentials.json')
  })

  it('loadCredentials returns null when no file exists', async () => {
    const { loadCredentials } = await import('../../src/studio/auth/credential-store.js')
    const result = await loadCredentials()
    expect(result).toBeNull()
  })

  it('saveCredentials creates file with correct content', async () => {
    const { saveCredentials, loadCredentials } = await import('../../src/studio/auth/credential-store.js')

    await saveCredentials({
      studioUrl: 'https://studio.test.io',
      accessToken: 'test-access-token',
      refreshToken: 'test-refresh-token',
      expiresAt: '2030-01-01T00:00:00Z',
    })

    const loaded = await loadCredentials()
    expect(loaded).not.toBeNull()
    expect(loaded!.studioUrl).toBe('https://studio.test.io')
    expect(loaded!.accessToken).toBe('test-access-token')
    expect(loaded!.refreshToken).toBe('test-refresh-token')
  })

  it('saveCredentials enforces 0o600 file permissions on POSIX', async () => {
    if (process.platform === 'win32') return

    const { saveCredentials, getCredentialsPath } = await import('../../src/studio/auth/credential-store.js')

    await saveCredentials({
      studioUrl: 'https://studio.test.io',
      accessToken: 'token',
      refreshToken: 'refresh',
      expiresAt: '2030-01-01T00:00:00Z',
    })

    const filePath = getCredentialsPath()
    const info = await stat(filePath)
    // eslint-disable-next-line no-bitwise
    const mode = info.mode & 0o777
    expect(mode).toBe(0o600)
  })

  it('clearCredentials removes the file', async () => {
    const { saveCredentials, clearCredentials, loadCredentials } = await import('../../src/studio/auth/credential-store.js')

    await saveCredentials({
      studioUrl: 'https://studio.test.io',
      accessToken: 'token',
      refreshToken: 'refresh',
      expiresAt: '2030-01-01T00:00:00Z',
    })

    await clearCredentials()
    const loaded = await loadCredentials()
    expect(loaded).toBeNull()
  })

  it('clearCredentials is safe to call when no file exists', async () => {
    const { clearCredentials } = await import('../../src/studio/auth/credential-store.js')
    await expect(clearCredentials()).resolves.not.toThrow()
  })

  it('loadCredentials prefers CONTENTRAIN_STUDIO_TOKEN env var', async () => {
    const { saveCredentials } = await import('../../src/studio/auth/credential-store.js')

    // Save file credentials
    await saveCredentials({
      studioUrl: 'https://studio.test.io',
      accessToken: 'file-token',
      refreshToken: 'file-refresh',
      expiresAt: '2030-01-01T00:00:00Z',
    })

    // Set env var
    process.env['CONTENTRAIN_STUDIO_TOKEN'] = 'env-token'
    process.env['CONTENTRAIN_STUDIO_URL'] = 'https://custom.studio.io'

    // Re-import to pick up env changes
    vi.resetModules()
    const { loadCredentials: reloadCreds } = await import('../../src/studio/auth/credential-store.js')

    const loaded = await reloadCreds()
    expect(loaded).not.toBeNull()
    expect(loaded!.accessToken).toBe('env-token')
    expect(loaded!.studioUrl).toBe('https://custom.studio.io')
    expect(loaded!.refreshToken).toBe('')
  })

  it('checkPermissions warns when file mode is too open', async () => {
    if (process.platform === 'win32') return

    const { saveCredentials, getCredentialsPath, checkPermissions } = await import('../../src/studio/auth/credential-store.js')

    await saveCredentials({
      studioUrl: 'https://studio.test.io',
      accessToken: 'token',
      refreshToken: 'refresh',
      expiresAt: '2030-01-01T00:00:00Z',
    })

    // Make file world-readable
    await chmod(getCredentialsPath(), 0o644)

    const warning = await checkPermissions()
    expect(warning).not.toBeNull()
    expect(warning).toContain('insecure')
  })

  it('checkPermissions returns null when permissions are correct', async () => {
    if (process.platform === 'win32') return

    const { saveCredentials, checkPermissions } = await import('../../src/studio/auth/credential-store.js')

    await saveCredentials({
      studioUrl: 'https://studio.test.io',
      accessToken: 'token',
      refreshToken: 'refresh',
      expiresAt: '2030-01-01T00:00:00Z',
    })

    const warning = await checkPermissions()
    expect(warning).toBeNull()
  })

  it('isTokenExpired returns true for past dates', async () => {
    const { isTokenExpired } = await import('../../src/studio/auth/credential-store.js')

    expect(isTokenExpired({
      studioUrl: 'https://studio.test.io',
      accessToken: 'token',
      refreshToken: 'refresh',
      expiresAt: '2020-01-01T00:00:00Z',
    })).toBe(true)
  })

  it('isTokenExpired returns false for future dates', async () => {
    const { isTokenExpired } = await import('../../src/studio/auth/credential-store.js')

    expect(isTokenExpired({
      studioUrl: 'https://studio.test.io',
      accessToken: 'token',
      refreshToken: 'refresh',
      expiresAt: '2040-01-01T00:00:00Z',
    })).toBe(false)
  })

  it('saveDefaults updates workspace/project without changing tokens', async () => {
    const { saveCredentials, saveDefaults, loadCredentials } = await import('../../src/studio/auth/credential-store.js')

    await saveCredentials({
      studioUrl: 'https://studio.test.io',
      accessToken: 'original-token',
      refreshToken: 'original-refresh',
      expiresAt: '2030-01-01T00:00:00Z',
    })

    await saveDefaults('ws-123', 'proj-456')

    const loaded = await loadCredentials()
    expect(loaded!.accessToken).toBe('original-token')
    expect(loaded!.defaultWorkspaceId).toBe('ws-123')
    expect(loaded!.defaultProjectId).toBe('proj-456')
  })

  it('loadCredentials returns null for invalid JSON', async () => {
    const { getCredentialsDir, getCredentialsPath, loadCredentials } = await import('../../src/studio/auth/credential-store.js')

    await mkdir(getCredentialsDir(), { recursive: true })
    await writeFile(getCredentialsPath(), 'not-json', 'utf-8')

    const loaded = await loadCredentials()
    expect(loaded).toBeNull()
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, writeFile, mkdir, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  log: { message: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
  spinner: () => ({ start: vi.fn(), stop: vi.fn() }),
  password: vi.fn(),
  isCancel: () => false,
}))

// The REST fetch is replaced by a recorder that answers with the WXR fixture,
// so the credential the command hands over can be checked without a network.
const restCalls: Array<{ origin: string; auth?: { user: string; appPassword: string } }> = []
vi.mock('@contentrain/wp-import', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@contentrain/wp-import')>()
  return {
    ...actual,
    fetchRestRawIR: async (opts: { origin: string; auth?: { user: string; appPassword: string } }) => {
      restCalls.push({ origin: opts.origin, auth: opts.auth })
      const { raw } = await actual.parseWxr(WXR)
      return { raw, warnings: [] }
    },
  }
})

const WXR = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>CLI Fixture</title>
  <link>https://cli.example</link>
  <language>en-US</language>
  <wp:wxr_version>1.2</wp:wxr_version>
  <wp:author><wp:author_id>1</wp:author_id><wp:author_login>ada</wp:author_login><wp:author_email>ada@cli.example</wp:author_email><wp:author_display_name><![CDATA[Ada]]></wp:author_display_name></wp:author>
  <wp:category><wp:term_id>2</wp:term_id><wp:category_nicename>news</wp:category_nicename><wp:cat_name><![CDATA[News]]></wp:cat_name></wp:category>
  <item>
    <title>Hello</title>
    <link>https://cli.example/hello/</link>
    <dc:creator><![CDATA[ada]]></dc:creator>
    <content:encoded><![CDATA[<p>Body</p>]]></content:encoded>
    <wp:post_id>10</wp:post_id>
    <wp:post_date_gmt>2026-01-01 10:00:00</wp:post_date_gmt>
    <wp:comment_status>closed</wp:comment_status>
    <wp:post_name>hello</wp:post_name>
    <wp:status>publish</wp:status>
    <wp:post_type>post</wp:post_type>
    <category domain="category" nicename="news"><![CDATA[News]]></category>
    <wp:comment><wp:comment_id>500</wp:comment_id><wp:comment_author><![CDATA[Reader]]></wp:comment_author><wp:comment_author_email>reader@cli.example</wp:comment_author_email><wp:comment_date_gmt>2026-01-03 09:00:00</wp:comment_date_gmt><wp:comment_content><![CDATA[Nice]]></wp:comment_content><wp:comment_approved>1</wp:comment_approved><wp:comment_parent>0</wp:comment_parent></wp:comment>
  </item>
</channel>
</rss>`

const run = async (args: Record<string, unknown>) => {
  const mod = await import('../../src/commands/import.js')
  await mod.default.run?.({ args } as never)
}

describe('import command', () => {
  let dir: string
  let wxrPath: string

  beforeEach(async () => {
    vi.clearAllMocks()
    restCalls.length = 0
    process.exitCode = undefined
    dir = await mkdtemp(join(tmpdir(), 'cr-import-'))
    wxrPath = join(dir, 'export.xml')
    await writeFile(wxrPath, WXR, 'utf8')
  })

  it('imports a WXR file into a .contentrain store with report, source map, and comments export', async () => {
    await run({ source: wxrPath, out: dir })
    expect(process.exitCode).toBeUndefined()

    const config = JSON.parse(await readFile(join(dir, '.contentrain/config.json'), 'utf8'))
    expect(config.locales.default).toBe('en')
    const posts = JSON.parse(await readFile(join(dir, '.contentrain/content/blog/posts/data.json'), 'utf8'))
    expect(Object.values(posts)[0]).toMatchObject({ title: 'Hello', slug: 'hello', wp_id: 10 })
    const map = JSON.parse(await readFile(join(dir, 'entry-source-map.json'), 'utf8'))
    expect(map['10'].model_id).toBe('posts')
    const comments = JSON.parse(await readFile(join(dir, 'comments-export.json'), 'utf8'))
    expect(comments.format).toBe('contentrain-comments@1')
    expect(comments.threads_closed).toEqual([10])
    await access(join(dir, 'import-report.json'))
  })

  it('refuses to overwrite an existing store without --force', async () => {
    await mkdir(join(dir, '.contentrain'), { recursive: true })
    await run({ source: wxrPath, out: dir })
    expect(process.exitCode).toBe(1)
  })

  it('overwrites with --force', async () => {
    await mkdir(join(dir, '.contentrain'), { recursive: true })
    await run({ source: wxrPath, out: dir, force: true })
    expect(process.exitCode).toBeUndefined()
    await access(join(dir, '.contentrain/models/posts.json'))
  })

  it('errors on a missing source file', async () => {
    await run({ source: join(dir, 'yok.xml'), out: dir })
    expect(process.exitCode).toBe(1)
  })

  it('leaves author and commenter e-mails out of the store by default', async () => {
    await run({ source: wxrPath, out: dir })
    expect(process.exitCode).toBeUndefined()
    const authors = await readFile(join(dir, '.contentrain/content/blog/authors/data.json'), 'utf8')
    const comments = await readFile(join(dir, '.contentrain/content/blog/comments/data.json'), 'utf8')
    expect(JSON.parse(authors)).not.toEqual({})
    expect(authors).not.toContain('ada@cli.example')
    expect(comments).not.toContain('reader@cli.example')
    expect(comments).toContain('Reader')
  })

  it('--include-emails writes them', async () => {
    await run({ source: wxrPath, out: dir, 'include-emails': true })
    expect(process.exitCode).toBeUndefined()
    expect(await readFile(join(dir, '.contentrain/content/blog/authors/data.json'), 'utf8')).toContain('ada@cli.example')
    expect(await readFile(join(dir, '.contentrain/content/blog/comments/data.json'), 'utf8')).toContain('reader@cli.example')
  })

  describe('REST credential', () => {
    const saved = { ...process.env }
    afterEach(() => {
      process.env = { ...saved }
    })

    it('reads user:password from CONTENTRAIN_WP_AUTH, with no deprecation warning', async () => {
      process.env.CONTENTRAIN_WP_AUTH = 'editor:abcd efgh:ijkl'
      await run({ source: 'https://cli.example', out: dir })
      expect(process.exitCode).toBeUndefined()
      expect(restCalls).toEqual([{ origin: 'https://cli.example', auth: { user: 'editor', appPassword: 'abcd efgh:ijkl' } }])
      const { log } = await import('@clack/prompts')
      expect(vi.mocked(log.warning).mock.calls.flat().join(' ')).not.toContain('deprecated')
    })

    it('--auth <user> takes the password from CONTENTRAIN_WP_APP_PASSWORD', async () => {
      process.env.CONTENTRAIN_WP_APP_PASSWORD = 'secret-pw'
      await run({ source: 'https://cli.example', out: dir, auth: 'editor' })
      expect(restCalls[0]?.auth).toEqual({ user: 'editor', appPassword: 'secret-pw' })
    })

    it('--auth user:password still works but warns that it is deprecated', async () => {
      await run({ source: 'https://cli.example', out: dir, auth: 'editor:argv-pw' })
      expect(restCalls[0]?.auth).toEqual({ user: 'editor', appPassword: 'argv-pw' })
      const { log } = await import('@clack/prompts')
      expect(vi.mocked(log.warning).mock.calls.flat().join(' ')).toContain('deprecated')
    })

    it('no credential anywhere → anonymous REST', async () => {
      delete process.env.CONTENTRAIN_WP_AUTH
      delete process.env.CONTENTRAIN_WP_APP_PASSWORD
      await run({ source: 'https://cli.example', out: dir })
      expect(restCalls[0]?.auth).toBeUndefined()
    })
  })
})

const loadResolver = async () => (await import('../../src/commands/import.js')).resolveRestAuth

describe('resolveRestAuth', () => {
  it('prompts for the password of --auth <user> when interactive and no env is set', async () => {
    const resolveRestAuth = await loadResolver()
    const prompt = vi.fn(async () => 'typed-pw')
    const r = await resolveRestAuth({ auth: 'editor', env: {}, interactive: true, prompt })
    expect(prompt).toHaveBeenCalledWith('editor')
    expect(r).toEqual({ auth: { user: 'editor', appPassword: 'typed-pw' } })
  })

  it('errors instead of prompting when not interactive', async () => {
    const resolveRestAuth = await loadResolver()
    const prompt = vi.fn(async () => 'typed-pw')
    const r = await resolveRestAuth({ auth: 'editor', env: {}, interactive: false, prompt })
    expect(prompt).not.toHaveBeenCalled()
    expect(r.error).toContain('CONTENTRAIN_WP_APP_PASSWORD')
  })

  it('--auth wins over CONTENTRAIN_WP_AUTH; a malformed env value is an error', async () => {
    const resolveRestAuth = await loadResolver()
    expect((await resolveRestAuth({ auth: 'a:b', env: { CONTENTRAIN_WP_AUTH: 'c:d' }, interactive: false })).auth).toEqual({ user: 'a', appPassword: 'b' })
    expect((await resolveRestAuth({ env: { CONTENTRAIN_WP_AUTH: 'no-colon' }, interactive: false })).error).toContain('user:password')
  })
})

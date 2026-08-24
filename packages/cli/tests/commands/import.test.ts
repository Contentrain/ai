import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, writeFile, mkdir, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  log: { message: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
  spinner: () => ({ start: vi.fn(), stop: vi.fn() }),
}))

const WXR = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>CLI Fixture</title>
  <link>https://cli.example</link>
  <language>en-US</language>
  <wp:wxr_version>1.2</wp:wxr_version>
  <wp:author><wp:author_id>1</wp:author_id><wp:author_login>ada</wp:author_login><wp:author_display_name><![CDATA[Ada]]></wp:author_display_name></wp:author>
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
    <wp:comment><wp:comment_id>500</wp:comment_id><wp:comment_author><![CDATA[Reader]]></wp:comment_author><wp:comment_date_gmt>2026-01-03 09:00:00</wp:comment_date_gmt><wp:comment_content><![CDATA[Nice]]></wp:comment_content><wp:comment_approved>1</wp:comment_approved><wp:comment_parent>0</wp:comment_parent></wp:comment>
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
})

import { describe, it, expect } from 'vitest'
import { parseWxr } from './index'

export const FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>Fixture Site</title>
  <link>https://fixture.example</link>
  <description>A test export</description>
  <language>en-US</language>
  <wp:wxr_version>1.2</wp:wxr_version>
  <wp:base_site_url>https://fixture.example</wp:base_site_url>
  <wp:base_blog_url>https://fixture.example</wp:base_blog_url>
  <wp:author><wp:author_id>1</wp:author_id><wp:author_login>ada</wp:author_login><wp:author_email>ada@example.com</wp:author_email><wp:author_display_name><![CDATA[Ada Lovelace]]></wp:author_display_name><wp:author_first_name><![CDATA[Ada]]></wp:author_first_name><wp:author_last_name><![CDATA[Lovelace]]></wp:author_last_name></wp:author>
  <wp:category><wp:term_id>2</wp:term_id><wp:category_nicename>news</wp:category_nicename><wp:category_parent></wp:category_parent><wp:cat_name><![CDATA[News]]></wp:cat_name></wp:category>
  <wp:category><wp:term_id>3</wp:term_id><wp:category_nicename>events</wp:category_nicename><wp:category_parent>news</wp:category_parent><wp:cat_name><![CDATA[Events]]></wp:cat_name></wp:category>
  <wp:tag><wp:term_id>4</wp:term_id><wp:tag_slug>intro</wp:tag_slug><wp:tag_name><![CDATA[Intro]]></wp:tag_name></wp:tag>
  <wp:term><wp:term_id>5</wp:term_id><wp:term_taxonomy>nav_menu</wp:term_taxonomy><wp:term_slug>primary</wp:term_slug><wp:term_name><![CDATA[Primary]]></wp:term_name></wp:term>
  <item>
    <title>Hello World</title>
    <link>https://fixture.example/hello-world/</link>
    <dc:creator><![CDATA[ada]]></dc:creator>
    <guid>https://fixture.example/?p=10</guid>
    <content:encoded><![CDATA[<p>First &amp; best post</p>]]></content:encoded>
    <excerpt:encoded><![CDATA[An excerpt]]></excerpt:encoded>
    <wp:post_id>10</wp:post_id>
    <wp:post_date>2026-01-01 12:00:00</wp:post_date>
    <wp:post_date_gmt>2026-01-01 10:00:00</wp:post_date_gmt>
    <wp:post_modified_gmt>2026-01-02 10:00:00</wp:post_modified_gmt>
    <wp:comment_status>open</wp:comment_status>
    <wp:post_name>hello-world</wp:post_name>
    <wp:status>publish</wp:status>
    <wp:post_parent>0</wp:post_parent>
    <wp:menu_order>0</wp:menu_order>
    <wp:post_type>post</wp:post_type>
    <wp:is_sticky>0</wp:is_sticky>
    <category domain="category" nicename="news"><![CDATA[News]]></category>
    <category domain="category" nicename="ghost"><![CDATA[Ghost]]></category>
    <category domain="post_tag" nicename="intro"><![CDATA[Intro]]></category>
    <wp:postmeta><wp:meta_key>_thumbnail_id</wp:meta_key><wp:meta_value>77</wp:meta_value></wp:postmeta>
    <wp:postmeta><wp:meta_key>sizes</wp:meta_key><wp:meta_value><![CDATA[a:2:{s:5:"small";i:1;s:3:"big";i:2;}]]></wp:meta_value></wp:postmeta>
    <wp:postmeta><wp:meta_key>subtitle</wp:meta_key><wp:meta_value><![CDATA[The alt title]]></wp:meta_value></wp:postmeta>
    <wp:postmeta><wp:meta_key>_subtitle</wp:meta_key><wp:meta_value>field_abc123def</wp:meta_value></wp:postmeta>
    <wp:comment><wp:comment_id>500</wp:comment_id><wp:comment_author><![CDATA[Reader]]></wp:comment_author><wp:comment_author_email>r@example.com</wp:comment_author_email><wp:comment_date_gmt>2026-01-03 09:00:00</wp:comment_date_gmt><wp:comment_content><![CDATA[Nice!]]></wp:comment_content><wp:comment_approved>1</wp:comment_approved><wp:comment_parent>0</wp:comment_parent></wp:comment>
    <wp:comment><wp:comment_id>501</wp:comment_id><wp:comment_author><![CDATA[Author]]></wp:comment_author><wp:comment_date_gmt>2026-01-03 10:00:00</wp:comment_date_gmt><wp:comment_content><![CDATA[Thanks]]></wp:comment_content><wp:comment_approved>0</wp:comment_approved><wp:comment_parent>500</wp:comment_parent></wp:comment>
  </item>
  <item>
    <title>About</title>
    <link>https://fixture.example/about/</link>
    <wp:post_id>11</wp:post_id>
    <wp:post_date_gmt>2026-01-05 10:00:00</wp:post_date_gmt>
    <wp:post_name>about</wp:post_name>
    <wp:status>draft</wp:status>
    <wp:post_type>page</wp:post_type>
    <content:encoded><![CDATA[<p>About us</p>]]></content:encoded>
  </item>
  <item>
    <title>Hero image</title>
    <wp:post_id>77</wp:post_id>
    <wp:post_name>hero</wp:post_name>
    <wp:status>inherit</wp:status>
    <wp:post_type>attachment</wp:post_type>
    <wp:post_parent>10</wp:post_parent>
    <wp:attachment_url>https://fixture.example/wp-content/uploads/hero.jpg</wp:attachment_url>
    <wp:postmeta><wp:meta_key>_wp_attached_file</wp:meta_key><wp:meta_value>2026/01/hero.jpg</wp:meta_value></wp:postmeta>
    <wp:postmeta><wp:meta_key>_wp_attachment_metadata</wp:meta_key><wp:meta_value><![CDATA[a:2:{s:5:"width";i:800;s:6:"height";i:600;}]]></wp:meta_value></wp:postmeta>
  </item>
  <item>
    <title>Home</title>
    <wp:post_id>100</wp:post_id>
    <wp:post_name>home-link</wp:post_name>
    <wp:status>publish</wp:status>
    <wp:post_type>nav_menu_item</wp:post_type>
    <wp:menu_order>1</wp:menu_order>
    <category domain="nav_menu" nicename="primary"><![CDATA[Primary]]></category>
    <wp:postmeta><wp:meta_key>_menu_item_type</wp:meta_key><wp:meta_value>custom</wp:meta_value></wp:postmeta>
    <wp:postmeta><wp:meta_key>_menu_item_url</wp:meta_key><wp:meta_value>https://fixture.example/</wp:meta_value></wp:postmeta>
  </item>
  <item>
    <title></title>
    <wp:post_id>101</wp:post_id>
    <wp:post_name>post-link</wp:post_name>
    <wp:status>publish</wp:status>
    <wp:post_type>nav_menu_item</wp:post_type>
    <wp:menu_order>2</wp:menu_order>
    <category domain="nav_menu" nicename="primary"><![CDATA[Primary]]></category>
    <wp:postmeta><wp:meta_key>_menu_item_type</wp:meta_key><wp:meta_value>post_type</wp:meta_value></wp:postmeta>
    <wp:postmeta><wp:meta_key>_menu_item_object</wp:meta_key><wp:meta_value>post</wp:meta_value></wp:postmeta>
    <wp:postmeta><wp:meta_key>_menu_item_object_id</wp:meta_key><wp:meta_value>10</wp:meta_value></wp:postmeta>
  </item>
</channel>
</rss>`

describe('parseWxr', () => {
  it('parses site, authors, terms, and entities with counts', async () => {
    const { raw, stats } = await parseWxr(FIXTURE)
    expect(raw.provenance.kind).toBe('wxr')
    expect(raw.site.title).toBe('Fixture Site')
    expect(raw.site.wxr_version).toBe('1.2')
    expect(raw.authors[0]).toMatchObject({ login: 'ada', display_name: 'Ada Lovelace' })
    expect(stats.counts).toMatchObject({ posts: 2, attachments: 1, menus: 1, comments: 2, authors: 1 })
    // nav_menu terms become menus, not taxonomy terms
    expect(raw.terms.map((t) => t.taxonomy).toSorted()).toEqual(['category', 'category', 'post_tag'])
  })

  it('prefers GMT dates and stamps them UTC', async () => {
    const { raw } = await parseWxr(FIXTURE)
    const post = raw.posts.find((p) => p.id === 10)!
    expect(post.date).toBe('2026-01-01T10:00:00Z')
    expect(post.modified).toBe('2026-01-02T10:00:00Z')
  })

  it('marks unresolved term references instead of dropping them', async () => {
    const { raw, stats } = await parseWxr(FIXTURE)
    const post = raw.posts.find((p) => p.id === 10)!
    const ghost = post.terms.find((t) => t.slug === 'ghost')!
    expect(ghost.resolved).toBe(false)
    expect(post.terms.find((t) => t.slug === 'news')!.resolved).toBe(true)
    expect(stats.unresolved_terms).toBe(1)
  })

  it('decodes serialized meta and pairs ACF fields', async () => {
    const { raw } = await parseWxr(FIXTURE)
    const post = raw.posts.find((p) => p.id === 10)!
    expect(post.meta.sizes).toEqual({ small: 1, big: 2 })
    expect(post.serialized_keys).toContain('sizes')
    expect(post.acf!.subtitle).toEqual({ value: 'The alt title', field_key: 'field_abc123def' })
  })

  it('splits attachments with decoded image meta', async () => {
    const { raw } = await parseWxr(FIXTURE)
    const att = raw.attachments[0]!
    expect(att).toMatchObject({ id: 77, file: '2026/01/hero.jpg', mime: 'image/jpeg', parent: 10, parent_resolved: true })
    expect(att.image_meta).toEqual({ width: 800, height: 600 })
  })

  it('builds menus from nav_menu terms and items with resolved targets', async () => {
    const { raw } = await parseWxr(FIXTURE)
    const menu = raw.menus![0]!
    expect(menu.slug).toBe('primary')
    expect(menu.items).toHaveLength(2)
    expect(menu.items[0]!.target).toEqual({ kind: 'url', url: 'https://fixture.example/', resolved: true })
    expect(menu.items[1]!.target).toMatchObject({ kind: 'post', post_type: 'post', id: 10, slug: 'hello-world', resolved: true })
  })

  it('threads comments with in-post parent resolution', async () => {
    const { raw } = await parseWxr(FIXTURE)
    const reply = raw.comments!.find((c) => c.id === 501)!
    expect(reply).toMatchObject({ post: 10, parent: 500, parent_resolved: true, approved: '0' })
    expect(reply.date).toBe('2026-01-03T10:00:00Z')
  })
})

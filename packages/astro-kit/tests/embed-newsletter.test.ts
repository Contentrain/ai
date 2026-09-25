import { describe, expect, it } from 'vitest'
import { embedTarget, mapTarget } from '../components/embed/embed'
import { newsletterForm, newsletterProviderOf } from '../components/newsletter/newsletter'

describe('embedTarget', () => {
  it('plays YouTube from youtube-nocookie.com, whatever address form the content used', () => {
    for (const url of ['https://www.youtube.com/watch?v=aqz-KE-bpKQ', 'https://youtu.be/aqz-KE-bpKQ', 'https://m.youtube.com/watch?v=aqz-KE-bpKQ&feature=share', 'https://www.youtube.com/embed/aqz-KE-bpKQ?rel=0', 'http://youtube.com/live/aqz-KE-bpKQ']) {
      const t = embedTarget(url)
      expect(t?.provider, url).toBe('youtube')
      expect(t?.src, url).toBe('https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ?autoplay=1&rel=0')
      expect(t?.href, url).toBe('https://www.youtube.com/watch?v=aqz-KE-bpKQ')
    }
  })

  it('keeps a start time and marks Shorts as portrait', () => {
    expect(embedTarget('https://youtu.be/aqz-KE-bpKQ?t=1m5s')?.src).toContain('start=65')
    expect(embedTarget('https://www.youtube.com/watch?v=aqz-KE-bpKQ&t=90')?.href).toBe('https://www.youtube.com/watch?v=aqz-KE-bpKQ&t=90s')
    expect(embedTarget('https://youtube.com/shorts/aqz-KE-bpKQ')).toMatchObject({ portrait: true, href: 'https://www.youtube.com/shorts/aqz-KE-bpKQ' })
  })

  it('refuses a malformed YouTube id instead of framing whatever follows', () => {
    expect(embedTarget('https://www.youtube.com/watch?v=abc')).toBeNull()
    expect(embedTarget('https://www.youtube.com/watch?v=aqz-KE-bpKQ"><script>')).toBeNull()
  })

  it('plays Vimeo with do-not-track, unlisted hashes included', () => {
    expect(embedTarget('https://vimeo.com/76979871')?.src).toBe('https://player.vimeo.com/video/76979871?autoplay=1&dnt=1')
    expect(embedTarget('https://vimeo.com/76979871/a1b2c3d4')?.src).toBe('https://player.vimeo.com/video/76979871?autoplay=1&dnt=1&h=a1b2c3d4')
    expect(embedTarget('https://player.vimeo.com/video/76979871?h=ff00')?.href).toBe('https://vimeo.com/76979871/ff00')
    expect(embedTarget('https://vimeo.com/channels/staffpicks/76979871')?.src).toContain('/video/76979871')
  })

  it('frames the known providers at their embed address, upgraded to https', () => {
    expect(embedTarget('https://www.google.com/maps/embed?pb=!1m18!1m12')).toMatchObject({ provider: 'google-maps', kind: 'map' })
    expect(embedTarget('http://www.openstreetmap.org/export/embed.html?bbox=1,2,3,4')?.src).toMatch(/^https:/)
    expect(embedTarget('https://open.spotify.com/embed/episode/7makk4oTQel546B0PZlDM5')).toMatchObject({ provider: 'spotify', kind: 'audio' })
    expect(embedTarget('https://w.soundcloud.com/player/?url=x')?.provider).toBe('soundcloud')
    expect(embedTarget('https://calendly.com/someone/30min')?.provider).toBe('calendly')
    expect(embedTarget('https://acme.typeform.com/to/AbC123')?.provider).toBe('typeform')
  })

  it('never frames an unknown host, a look-alike, or a non-web scheme', () => {
    for (const url of ['https://example.com/widget/42', 'https://google.com.evil.example/maps/embed', 'https://www.google.evil/maps/embed', 'https://calendly.com.evil.example/x', 'https://www.google.com/search?q=maps', 'https://open.spotify.com/track/1', 'javascript:alert(1)', 'data:text/html,hi', 'not a url', '']) {
      expect(embedTarget(url), url).toBeNull()
    }
  })
})

describe('mapTarget', () => {
  it('shows an address on a Google map, encoded', () => {
    const t = mapTarget('Rua Augusta 100, Lisbon')
    expect(t?.src).toBe('https://www.google.com/maps?q=Rua%20Augusta%20100%2C%20Lisbon&output=embed')
    expect(t?.href).toBe('https://www.google.com/maps/search/?api=1&query=Rua%20Augusta%20100%2C%20Lisbon')
    expect(mapTarget('  ')).toBeNull()
  })
})

describe('newsletterForm', () => {
  it('names the fields the way each provider expects', () => {
    expect(newsletterForm('mailchimp', 'https://x.us21.list-manage.com/subscribe/post?u=abc&id=def')).toEqual({
      action: 'https://x.us21.list-manage.com/subscribe/post?u=abc&id=def', email: 'EMAIL', name: 'FNAME', hidden: [{ name: 'b_abc_def', value: '' }],
    })
    expect(newsletterForm('kit', 'https://app.kit.com/forms/1/subscriptions')).toMatchObject({ email: 'email_address', name: 'fields[first_name]', hidden: [] })
    expect(newsletterForm('brevo', 'https://a1b2.sibforms.com/serve/MUIFAB')).toMatchObject({ email: 'EMAIL', name: 'FIRSTNAME' })
    expect(newsletterForm('mailerlite', 'https://assets.mailerlite.com/jsonp/1/forms/2/subscribe')).toMatchObject({ email: 'fields[email]' })
    expect(newsletterForm('buttondown', 'https://buttondown.com/api/emails/embed-subscribe/j')).toMatchObject({ email: 'email', name: null })
    expect(newsletterForm('other', 'https://lists.example.org/subscribe', { email: 'addr' })).toMatchObject({ email: 'addr', name: null })
  })

  it('refuses an action that cannot deliver from a static site', () => {
    expect(newsletterForm('mailchimp', 'http://x.list-manage.com/subscribe/post?u=a&id=b')).toBeNull()
    expect(newsletterForm('other', '/wp-admin/admin-ajax.php')).toBeNull()
    expect(newsletterForm('other', 'javascript:alert(1)')).toBeNull()
  })

  it('posts only to the named provider\'s hosted endpoint: a WordPress-side handler is dead on a static site (QA-46 B1)', () => {
    // MC4WP posts to its own page, Divi signup to admin-ajax: https, but the site itself.
    expect(newsletterForm('mailchimp', 'https://example.com/newsletter/')).toBeNull()
    expect(newsletterForm('mailchimp', 'https://example.com/wp-admin/admin-ajax.php')).toBeNull()
    // Look-alikes and wrong paths.
    expect(newsletterForm('mailchimp', 'https://x.list-manage.com.evil.example/subscribe/post?u=a&id=b')).toBeNull()
    expect(newsletterForm('mailchimp', 'https://list-manage.com/subscribe/post?u=a&id=b')).toBeNull()
    expect(newsletterForm('mailchimp', 'https://x.list-manage.com/account/login')).toBeNull()
    expect(newsletterForm('brevo', 'https://sibforms.com.evil.example/serve/X')).toBeNull()
    // The right endpoint under the wrong provider: its field names would be wrong.
    expect(newsletterForm('kit', 'https://x.us21.list-manage.com/subscribe/post?u=a&id=b')).toBeNull()
    // `other` takes any https address except the site's own origin.
    expect(newsletterForm('other', 'https://example.com/subscribe', {}, 'https://www.example.com')).toBeNull()
    expect(newsletterForm('other', 'https://lists.example.org/subscribe', {}, 'https://example.com')).not.toBeNull()
  })

  it('names the provider an action belongs to, for the migration to choose `provider`', () => {
    expect(newsletterProviderOf('https://us21.list-manage.com/subscribe/post?u=a&id=b')).toBe('mailchimp')
    expect(newsletterProviderOf('https://app.convertkit.com/forms/42/subscriptions')).toBe('kit')
    expect(newsletterProviderOf('https://assets.mailerlite.com/jsonp/1/forms/2/subscribe')).toBe('mailerlite')
    expect(newsletterProviderOf('https://buttondown.com/api/emails/embed-subscribe/journal')).toBe('buttondown')
    expect(newsletterProviderOf('https://example.com/?na=s')).toBeNull()
    expect(newsletterProviderOf('http://us21.list-manage.com/subscribe/post')).toBeNull()
  })

  it('leaves out a Mailchimp bot-trap name built from odd query values', () => {
    expect(newsletterForm('mailchimp', 'https://x.list-manage.com/subscribe/post?u=a"b&id=c')?.hidden).toEqual([])
  })
})

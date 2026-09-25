// How a newsletter provider's hosted form endpoint wants its fields named, and
// whether an action really is that endpoint. The form posts straight to the
// provider — no script, no server of our own — so the names have to be the
// provider's, and the address has to be the provider's: a WordPress-side
// handler (MC4WP posting to its own page, Divi's admin-ajax, Jetpack) is dead
// on a static site, and a POST to it would lose every sign-up without a sound.

export type NewsletterProvider = 'mailchimp' | 'kit' | 'mailerlite' | 'brevo' | 'buttondown' | 'other'

export interface NewsletterForm {
  action: string
  email: string
  /** First-name field, when the provider takes one. */
  name: string | null
  /** Hidden fields the provider expects (Mailchimp's bot trap). */
  hidden: Array<{ name: string, value: string }>
}

interface Endpoint {
  email: string
  name: string | null
  /** The provider's hosted form endpoint: exact host (or a subdomain of an exact parent) and path. */
  accepts: (url: URL) => boolean
}

/** A subdomain of `parent`, one or two labels deep (Mailchimp: `<account>.us21.list-manage.com`). */
const sub = (host: string, parent: string): boolean => host.endsWith(`.${parent}`) && /^[a-z0-9-]+(?:\.[a-z0-9-]+)?$/.test(host.slice(0, -parent.length - 1))

export const NEWSLETTER_ENDPOINTS: Record<Exclude<NewsletterProvider, 'other'>, Endpoint> = {
  mailchimp: { email: 'EMAIL', name: 'FNAME', accepts: u => sub(u.hostname, 'list-manage.com') && u.pathname.startsWith('/subscribe/post') },
  kit: { email: 'email_address', name: 'fields[first_name]', accepts: u => ['app.kit.com', 'app.convertkit.com'].includes(u.hostname) && /^\/forms\/\d+\/subscriptions\/?$/.test(u.pathname) },
  mailerlite: { email: 'fields[email]', name: 'fields[name]', accepts: u => u.hostname === 'assets.mailerlite.com' && /^\/jsonp\/\d+\/forms\/\d+\/subscribe\/?$/.test(u.pathname) },
  brevo: { email: 'EMAIL', name: 'FIRSTNAME', accepts: u => sub(u.hostname, 'sibforms.com') && u.pathname.startsWith('/serve/') },
  buttondown: { email: 'email', name: null, accepts: u => u.hostname === 'buttondown.com' && u.pathname.startsWith('/api/emails/embed-subscribe/') },
}

/** The provider whose hosted endpoint an action is, or null. What the migration uses to choose `provider`. */
export function newsletterProviderOf(action: string): Exclude<NewsletterProvider, 'other'> | null {
  let url: URL
  try { url = new URL(action.trim()) }
  catch { return null }
  if (url.protocol !== 'https:') return null
  return (Object.entries(NEWSLETTER_ENDPOINTS) as Array<[Exclude<NewsletterProvider, 'other'>, Endpoint]>).find(([, e]) => e.accepts(url))?.[0] ?? null
}

/**
 * The form for a provider and its action; `null` when the action cannot deliver: not https, not the named
 * provider's hosted endpoint, or (for `other`) the site's own origin — a static site cannot receive a POST.
 */
export function newsletterForm(provider: NewsletterProvider, action: string, names: { email?: string | undefined, name?: string | undefined } = {}, siteOrigin?: string | URL | undefined): NewsletterForm | null {
  let url: URL
  try { url = new URL(action.trim()) }
  catch { return null }
  if (url.protocol !== 'https:') return null
  if (provider !== 'other' && !NEWSLETTER_ENDPOINTS[provider].accepts(url)) return null
  if (provider === 'other') {
    const own = siteOrigin ? new URL(String(siteOrigin)).hostname.replace(/^www\./, '') : null
    if (own && url.hostname.replace(/^www\./, '') === own) return null
  }
  const preset = provider === 'other' ? { email: 'email', name: null } : NEWSLETTER_ENDPOINTS[provider]
  const hidden: NewsletterForm['hidden'] = []
  // Mailchimp drops a submission whose `b_<u>_<id>` field is filled: the field a bot fills and a person never sees.
  if (provider === 'mailchimp') {
    const u = url.searchParams.get('u')
    const id = url.searchParams.get('id')
    if (u && id && /^\w+$/.test(u) && /^\w+$/.test(id)) hidden.push({ name: `b_${u}_${id}`, value: '' })
  }
  return { action: url.href, email: names.email || preset.email, name: names.name || preset.name, hidden }
}

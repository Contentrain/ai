// How a newsletter provider's hosted form endpoint wants its fields named. The
// form posts straight to the provider — no script, no server of our own —
// so the names have to be the provider's.

export type NewsletterProvider = 'mailchimp' | 'kit' | 'mailerlite' | 'brevo' | 'buttondown' | 'other'

export interface NewsletterForm {
  action: string
  email: string
  /** First-name field, when the provider takes one. */
  name: string | null
  /** Hidden fields the provider expects (Mailchimp's bot trap). */
  hidden: Array<{ name: string, value: string }>
}

const FIELDS: Record<Exclude<NewsletterProvider, 'other'>, { email: string, name: string | null }> = {
  mailchimp: { email: 'EMAIL', name: 'FNAME' },
  kit: { email: 'email_address', name: 'fields[first_name]' },
  mailerlite: { email: 'fields[email]', name: 'fields[name]' },
  brevo: { email: 'EMAIL', name: 'FIRSTNAME' },
  buttondown: { email: 'email', name: null },
}

/**
 * The form for a provider and its action URL; `null` when the action is not an https address
 * (a WordPress-side handler like admin-ajax is dead on a static site and must not be posted to).
 */
export function newsletterForm(provider: NewsletterProvider, action: string, names: { email?: string | undefined, name?: string | undefined } = {}): NewsletterForm | null {
  let url: URL
  try { url = new URL(action.trim()) }
  catch { return null }
  if (url.protocol !== 'https:') return null
  const preset = provider === 'other' ? { email: 'email', name: null } : FIELDS[provider]
  const hidden: NewsletterForm['hidden'] = []
  // Mailchimp drops a submission whose `b_<u>_<id>` field is filled: the field a bot fills and a person never sees.
  if (provider === 'mailchimp') {
    const u = url.searchParams.get('u')
    const id = url.searchParams.get('id')
    if (u && id && /^\w+$/.test(u) && /^\w+$/.test(id)) hidden.push({ name: `b_${u}_${id}`, value: '' })
  }
  return { action: url.href, email: names.email || preset.email, name: names.name || preset.name, hidden }
}

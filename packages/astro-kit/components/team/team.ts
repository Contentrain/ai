// The network a profile address belongs to, read from its host (`linkedin.com` → LinkedIn); an unknown host is shown as itself.
const NETWORKS: Record<string, string> = { 'linkedin.com': 'LinkedIn', 'github.com': 'GitHub', 'x.com': 'X', 'twitter.com': 'X', 'instagram.com': 'Instagram', 'facebook.com': 'Facebook', 'youtube.com': 'YouTube', 'dribbble.com': 'Dribbble', 'behance.net': 'Behance', 'medium.com': 'Medium' }

export const profile = (href: string) => {
  let host = href
  try { host = new URL(href).hostname.replace(/^www\./, '') } catch { /* a relative address keeps its own text */ }
  // `mailto:` and `tel:` addresses have no host: the address itself is the label, never an empty one.
  return { href, label: NETWORKS[host] ?? (host || href) }
}

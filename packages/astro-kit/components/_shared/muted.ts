// Quieter text (an intro, a caption, a role, a footer link) in a colour role, never a dimmed ink: opacity lays the
// text over whatever is behind it, and on a mid-tone band that falls under 4.5:1. The role is the one made for the
// band the text sits on. A band sets `--kit-muted` (dark: `--color-ink-muted-inverse`, a fill: its own ink), a light
// surface inside it (a card, a form panel, a drawer) clears it again, and without either it is `--color-ink-muted`.

/** Quieter text: the band's muted role. */
export const muted = 'text-[color:var(--kit-muted,var(--color-ink-muted))]'

/** On a dark band: the muted role made for it, or the band's own text where the site's theme has none. */
export const mutedInverse = '[--kit-muted:var(--color-ink-muted-inverse,var(--color-surface))]'

/** On the accent fill: no muted role is made for it, so quieter text there is the fill's own ink. */
export const mutedAccent = '[--kit-muted:var(--color-accent-ink)]'

/** On the brand fill: the fill's own ink, as on the accent. */
export const mutedBrand = '[--kit-muted:var(--color-brand-ink)]'

/** A light surface inside a band (a card, a form panel, a drawer): back to the page's muted role. */
export const mutedReset = '[--kit-muted:initial]'

/**
 * A Typography body (`prose prose-site`) on a band: its text in the band's own colour and its quieter parts (lead,
 * bullets, counters, captions) in the band's muted role. `prose-site` binds the page's ink, and on a dark band that is
 * the band's own fill (1:1); on a filled band, ink under 4.5:1. On the page's own surface both are the ink, as before.
 */
export const proseOnBand = '[--tw-prose-body:currentColor] [--tw-prose-headings:currentColor] [--tw-prose-bold:currentColor] [--tw-prose-quotes:currentColor] [--tw-prose-code:currentColor] [--tw-prose-lead:var(--kit-muted,var(--color-ink-muted))] [--tw-prose-counters:var(--kit-muted,var(--color-ink-muted))] [--tw-prose-bullets:var(--kit-muted,var(--color-ink-muted))] [--tw-prose-captions:var(--kit-muted,var(--color-ink-muted))]'

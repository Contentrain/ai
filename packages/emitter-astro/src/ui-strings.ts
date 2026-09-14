// The generated site's interface text — what its comments and forms say to a
// visitor — lives in the site's content store, not in its code.
//
// A migrated Turkish site whose comment form says "Send" is a defect the
// customer can see and cannot fix without editing TypeScript. As a dictionary
// in `.contentrain/`, the text is content: the migration writes it in the
// source site's language, the customer edits it in Studio or through MCP, and a
// rebuild picks it up with no re-emit.
//
// The emitter owns the key list and the English defaults, so the site still
// works — in English — when the dictionary is absent. It never writes the
// dictionary itself: which words a site uses is a content decision.

import type { ModelDefinition } from '@contentrain/types'
import { DICTIONARY_TITLE_FIELD } from '@contentrain/types'

/** Where the dictionary lives in an emitted project, relative to its root. */
export const UI_STRINGS_DIR = '.contentrain/content/site/ui-strings'

/** Every key the runtime components read, with the text they show without a dictionary. */
export const UI_STRING_DEFAULTS = {
  'comments.cancel': 'Cancel',
  'comments.closed': 'Comments are closed.',
  'comments.empty': 'No comments yet.',
  'comments.field.comment': 'Comment',
  'comments.field.email': 'Email',
  'comments.field.email_note': '(never shown)',
  'comments.field.name': 'Name',
  'comments.field.website': 'Website',
  'comments.load_more': 'Load more comments',
  'comments.moderator': 'Moderator',
  'comments.noscript': 'Comments need JavaScript.',
  'comments.pending': 'Thank you — your comment is awaiting moderation.',
  'comments.post': 'Post comment',
  'comments.posted': 'Your comment has been posted.',
  'comments.replying_to': 'Replying to',
  'comments.reply': 'Reply',
  'comments.title': 'Comments',
  'common.failed': 'Something went wrong. Please try again.',
  'common.loading': 'Loading…',
  'form.honeypot': 'Leave this field empty',
  'form.noscript': 'This form needs JavaScript.',
  'form.send': 'Send',
  'form.sending': 'Sending…',
} as const

export type UiStringKey = keyof typeof UI_STRING_DEFAULTS

/**
 * The dictionary model a producer creates in the site's store. Exported so the
 * migration and the emitter cannot disagree about its id, kind or domain.
 */
export const UI_STRINGS_MODEL: ModelDefinition = {
  id: 'ui-strings',
  name: 'Site interface text',
  kind: 'dictionary',
  domain: 'site',
  i18n: true,
  title_field: DICTIONARY_TITLE_FIELD,
  description: 'What the site’s comments and forms say to visitors, per language. Missing keys fall back to English.',
}

/**
 * A project-relative directory safe to put in a glob, or undefined. The value
 * lands in source the build evaluates, so anything that could leave the
 * project or change the pattern is refused rather than escaped.
 */
export function uiStringsDir(dir: string | undefined): string | undefined {
  const value = (dir ?? UI_STRINGS_DIR).replace(/^\/+|\/+$/g, '')
  if (!value || value.split('/').some((s) => s === '..' || s === '.' || s === '') || !/^[\w.@-]+(?:\/[\w.@-]+)*$/.test(value)) return undefined
  return value
}

/**
 * `src/lib/ui-strings.ts` for an emitted project: reads every locale file of
 * the dictionary at build time and resolves a page's text over the defaults.
 *
 * `import.meta.glob` returns an empty map when nothing matches, so a project
 * without the dictionary still builds. It does not stay quiet about it: a page
 * in a language other than English with no dictionary, or a dictionary missing
 * keys, is reported once in the build log.
 */
export function uiStringsSource(dir: string): string {
  const pattern = `/${dir}/*.json`
  return `// Emitted by @contentrain/emitter-astro — the site's interface text.
//
// Comments and forms read their visitor-facing text from the ui-strings
// dictionary in the content store (${dir}/{locale}.json), so it is
// edited as content — in Studio or through MCP — and a rebuild applies it.
// Keys the dictionary does not have show the English default below.

const DEFAULTS: Record<string, string> = ${JSON.stringify(UI_STRING_DEFAULTS, null, 2)}

const files = import.meta.glob<Record<string, unknown>>(${JSON.stringify(pattern)}, { eager: true, import: 'default' })
const dictionaries = new Map(
  Object.entries(files).map(([path, dictionary]) => [path.slice(path.lastIndexOf('/') + 1, -5).toLowerCase(), dictionary]),
)
const reported = new Set<string>()

/** The interface text for a page language: the dictionary's values over the defaults. */
export function uiStrings(lang: string | undefined): Record<string, string> {
  const locale = (lang || 'en').toLowerCase()
  // tr-TR reads tr.json when there is no tr-tr.json — the store keys by primary subtag.
  const name = dictionaries.has(locale) ? locale : (locale.split('-')[0] ?? locale)
  const dictionary = dictionaries.get(name)
  const text: Record<string, string> = { ...DEFAULTS }
  const missing: string[] = []
  for (const key of Object.keys(DEFAULTS)) {
    const value = dictionary?.[key]
    if (typeof value === 'string' && value !== '') text[key] = value
    else missing.push(key)
  }
  if (!name.startsWith('en') && missing.length && !reported.has(name)) {
    reported.add(name)
    console.warn(
      dictionary
        ? '[contentrain] ui-strings: ' + name + '.json has no text for ' + missing.join(', ') + ' — those show in English'
        : '[contentrain] ui-strings: no dictionary for "' + name + '" at ${dir}/' + name + '.json — comments and forms show English text',
    )
  }
  return text
}
`
}

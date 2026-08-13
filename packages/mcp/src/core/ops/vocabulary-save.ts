import type { Vocabulary } from '@contentrain/types'
import { canonicalStringify, LOCALE_PATTERN, SLUG_PATTERN } from '@contentrain/types'
import type { FileChange, RepoReader } from '../contracts/index.js'
import type { OpPlan } from './types.js'

const VOCABULARY_PATH = '.contentrain/vocabulary.json'

/** Terms named individually in an advisory before it collapses to a count. */
const MAX_REPORTED_TERMS = 5

export interface VocabularySaveInput {
  /**
   * Terms to add or update, keyed by term slug, each holding its translations
   * keyed by locale. Merged with what is already there — a term absent from
   * this map is untouched.
   */
  terms: Record<string, Record<string, string>>
}

export interface VocabularyDeleteInput {
  /** Term slugs to remove. A slug that is not present is reported, not an error. */
  terms: string[]
}

export interface VocabularySaveResult {
  added: string[]
  updated: string[]
  total: number
}

export interface VocabularyDeleteResult {
  deleted: string[]
  missing: string[]
  total: number
}

export type VocabularySavePlan = OpPlan<VocabularySaveResult>
export type VocabularyDeletePlan = OpPlan<VocabularyDeleteResult>

async function readVocabulary(reader: RepoReader): Promise<Vocabulary> {
  try {
    const parsed = JSON.parse(await reader.readFile(VOCABULARY_PATH)) as Partial<Vocabulary>
    return { version: parsed.version ?? 1, terms: parsed.terms ?? {} }
  } catch {
    return { version: 1, terms: {} }
  }
}

/**
 * Validate the shape callers get wrong.
 *
 * The nesting is `term -> locale -> translation`, and it reads identically the
 * other way round, so a caller that groups by locale at the top level produces
 * a structurally valid file that matches nothing. That is not a typo anyone
 * notices — the vocabulary simply stops having any effect. Checking that outer
 * keys are term slugs and inner keys are locale codes catches the inversion at
 * the point of writing.
 */
function validateTerms(terms: Record<string, Record<string, string>>): string[] {
  const errors: string[] = []

  for (const [term, translations] of Object.entries(terms)) {
    if (!SLUG_PATTERN.test(term)) {
      errors.push(`Term "${term}": must be kebab-case. The outer key is the term, not a locale.`)
    }
    if (typeof translations !== 'object' || translations === null || Array.isArray(translations)) {
      errors.push(`Term "${term}": expected an object of locale → translation.`)
      continue
    }
    if (Object.keys(translations).length === 0) {
      errors.push(`Term "${term}": has no translations.`)
    }
    for (const [locale, value] of Object.entries(translations)) {
      if (!LOCALE_PATTERN.test(locale)) {
        errors.push(
          `Term "${term}": "${locale}" is not a locale code. Terms nest as { "${term}": { "en": "…" } } — one term, its translations inside.`,
        )
      }
      if (typeof value !== 'string') {
        errors.push(`Term "${term}" (${locale}): translation must be a string, got ${typeof value}.`)
      }
    }
  }

  return errors
}

/**
 * Build the FileChange[] to add or update vocabulary terms.
 *
 * Vocabulary had no write tool at all: the rules forbid editing `.contentrain/`
 * by hand, and there was no supported way to obey that. This closes it through
 * the same plan/apply path every other write uses, so it lands on a `cr/*`
 * branch and follows the project's workflow like anything else.
 */
export async function planVocabularySave(
  reader: RepoReader,
  input: VocabularySaveInput,
): Promise<VocabularySavePlan> {
  const errors = validateTerms(input.terms)
  if (errors.length > 0) {
    throw new Error(`Vocabulary validation failed:\n- ${errors.join('\n- ')}`)
  }

  const existing = await readVocabulary(reader)
  const added: string[] = []
  const updated: string[] = []
  const advisories: string[] = []

  const merged: Record<string, Record<string, string>> = { ...existing.terms }
  for (const [term, translations] of Object.entries(input.terms)) {
    const prior = existing.terms[term]
    if (!prior) {
      added.push(term)
      merged[term] = { ...translations }
      continue
    }
    updated.push(term)
    // Merge per locale: adding a Turkish translation must not drop the English.
    merged[term] = { ...prior, ...translations }

    const changed = Object.entries(translations).filter(([l, v]) => l in prior && prior[l] !== v)
    if (changed.length > 0) {
      const shown = changed.slice(0, MAX_REPORTED_TERMS)
      const detail = shown.map(([l, v]) => `${l}: "${prior[l]}" → "${v}"`).join(', ')
      const more = changed.length > shown.length ? `, and ${changed.length - shown.length} more` : ''
      advisories.push(`Term "${term}": replaced ${changed.length} translation(s) — ${detail}${more}.`)
    }
  }

  // A canonical term whose value duplicates another term's is the whole thing
  // this file exists to prevent, so it is worth saying out loud.
  const byValue = new Map<string, string>()
  for (const [term, translations] of Object.entries(merged)) {
    for (const value of Object.values(translations)) {
      const owner = byValue.get(value)
      if (owner && owner !== term) {
        advisories.push(`Terms "${owner}" and "${term}" share the translation "${value}".`)
      } else {
        byValue.set(value, term)
      }
    }
  }

  const next: Vocabulary = { version: existing.version, terms: merged }
  const changes: FileChange[] = [
    { path: VOCABULARY_PATH, content: canonicalStringify(next) },
  ]

  return {
    changes,
    result: { added, updated, total: Object.keys(merged).length },
    advisories,
  }
}

/** Build the FileChange[] to remove vocabulary terms. */
export async function planVocabularyDelete(
  reader: RepoReader,
  input: VocabularyDeleteInput,
): Promise<VocabularyDeletePlan> {
  const existing = await readVocabulary(reader)

  const deleted: string[] = []
  const missing: string[] = []
  const remaining = { ...existing.terms }

  for (const term of input.terms) {
    if (term in remaining) {
      delete remaining[term]
      deleted.push(term)
    } else {
      missing.push(term)
    }
  }

  const advisories = missing.length > 0
    ? [`Not in the vocabulary, so nothing to delete: ${missing.join(', ')}.`]
    : []

  // Nothing changed — emit no FileChange, so the caller can skip the commit
  // rather than create an empty branch.
  const changes: FileChange[] = deleted.length > 0
    ? [{ path: VOCABULARY_PATH, content: canonicalStringify({ version: existing.version, terms: remaining } satisfies Vocabulary) }]
    : []

  return {
    changes,
    result: { deleted, missing, total: Object.keys(remaining).length },
    advisories,
  }
}

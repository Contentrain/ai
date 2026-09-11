// Frontmatter parsing shared by the client generator and the Astro loader.
//
// Both read the same `.contentrain` documents, so the parser lives here rather
// than being replicated: a divergence would mean the generated client and the
// Astro collection disagree about the same file's fields.
//
// The same argument reaches one level further out. The content engine reads
// these documents too, through `@contentrain/types`, and for a while this file
// carried its own copy of the scalar rules — so the two disagreed about what a
// quoted string with escapes in it says. The *structure* below (nesting,
// indentation, the model-aware string coercion) is this package's; the scalar
// grammar is imported, because how a value is spelled on disk is a contract
// rather than an implementation detail.

import type { ModelDefinition } from '@contentrain/types'
import {
  parseFrontmatterScalar,
  parseFrontmatterScalarString,
  splitFrontmatterList,
} from '@contentrain/types'

// Field types that map to `string` in the generated types — their frontmatter
// values must NOT be numerically coerced (e.g. a string SKU "007").
const STRING_LIKE_TYPES = new Set([
  'string', 'text', 'email', 'url', 'slug', 'color', 'phone', 'code', 'icon',
  'markdown', 'richtext', 'date', 'datetime', 'image', 'video', 'file',
  'select', 'relation',
])

export function stringLikeFieldKeys(model: ModelDefinition): Set<string> {
  const keys = new Set<string>()
  if (model.fields) {
    for (const [name, field] of Object.entries(model.fields)) {
      if (STRING_LIKE_TYPES.has(field.type)) keys.add(name)
    }
  }
  return keys
}

// Minimal frontmatter parser (replicated from MCP pattern)
export function parseFrontmatter(text: string, stringKeys: Set<string> = new Set()): { frontmatter: Record<string, unknown>; body: string } {
  const normalized = text.replace(/\r\n/g, '\n')
  const match = normalized.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!match) return { frontmatter: {}, body: normalized }

  const fmStr = match[1]!
  const body = match[2]!.trim()
  const frontmatter: Record<string, unknown> = {}

  // Stack-based parser that handles nested objects and arrays
  const lines = fmStr.split('\n')
  const stack: Array<{ obj: Record<string, unknown>; indent: number }> = [{ obj: frontmatter, indent: -1 }]

  for (const [lineIndex, line] of lines.entries()) {
    // Skip empty lines
    if (line.trim() === '') continue

    // Array item
    const arrayMatch = line.match(/^(\s*)-\s+(.*)$/)
    if (arrayMatch) {
      const arrIndent = arrayMatch[1]!.length
      const value = arrayMatch[2]!.trim()
      // Find the parent that owns this array
      while (stack.length > 1 && stack[stack.length - 1]!.indent >= arrIndent) {
        stack.pop()
      }
      const parent = stack[stack.length - 1]!.obj
      const lastKey = Object.keys(parent).pop()
      if (lastKey && Array.isArray(parent[lastKey])) {
        (parent[lastKey] as unknown[]).push(parseValue(value))
      }
      continue
    }

    // Key-value pair
    const kvMatch = line.match(/^(\s*)([\w][\w.-]*)\s*:\s*(.*)$/)
    if (!kvMatch) continue

    const kvIndent = kvMatch[1]!.length
    const key = kvMatch[2]!
    const rawValue = kvMatch[3]!.trim()

    // Pop stack to find correct parent based on indentation
    while (stack.length > 1 && stack[stack.length - 1]!.indent >= kvIndent) {
      stack.pop()
    }
    const current = stack[stack.length - 1]!.obj

    if (rawValue === '') {
      // A bare `key:` is ambiguous: empty array, empty object, or null. It is
      // resolved by what follows — a list item opens an array, a more-indented
      // key opens an object, and anything else (including end of frontmatter)
      // is an empty array, which is what the canonical reader in
      // `@contentrain/types` returns. Documents written today say `key: []`
      // outright; this path is for the ones written before that.
      //
      // The peek used `lines.indexOf(line)`, which finds the FIRST line with
      // this text rather than this one — two identically spelled lines in one
      // document made the second read the first one's successor.
      let nextLine = ''
      for (let i = lineIndex + 1; i < lines.length; i += 1) {
        if (lines[i]!.trim() !== '') {
          nextLine = lines[i]!
          break
        }
      }
      const nextIndent = nextLine.length - nextLine.trimStart().length
      if (nextLine.trim().startsWith('-')) {
        current[key] = []
      } else if (nextLine !== '' && nextIndent > kvIndent) {
        const nested: Record<string, unknown> = {}
        current[key] = nested
        stack.push({ obj: nested, indent: kvIndent })
      } else {
        current[key] = []
      }
      continue
    }

    if (rawValue.startsWith('[') && rawValue.endsWith(']')) {
      const inner = rawValue.slice(1, -1).trim()
      current[key] = inner === ''
        ? []
        : splitFrontmatterList(inner).map(item => parseFrontmatterScalarString(item.trim()))
      continue
    }

    // Only top-level keys are matched against the model's declared field types.
    const forceString = current === frontmatter && stringKeys.has(key)
    current[key] = parseValue(rawValue, forceString)
  }

  return { frontmatter, body }
}

function parseValue(raw: string, forceString = false): unknown {
  return forceString ? parseFrontmatterScalarString(raw) : parseFrontmatterScalar(raw)
}

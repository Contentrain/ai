import { MODEL_FIELD_ORDER } from '@contentrain/types'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Keeps the published docs honest about the model schema.
 *
 * `docs/` is a VitePress package with no `test` script, so `pnpm -r run test`
 * never visits it — which is how a required property could land in
 * `@contentrain/types`, ship, and leave every example on the docs site showing
 * a model that would now be rejected. Nothing in the repo would have noticed.
 *
 * Hosted here because mcp is the runtime authority and already has a suite.
 * Skipped rather than failed if `docs/` is absent, so the package still tests
 * cleanly when consumed on its own.
 */

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..')
const DOCS = join(REPO_ROOT, 'docs')

const read = (...parts: string[]): string => readFileSync(join(DOCS, ...parts), 'utf-8')

/**
 * Fenced blocks that are a model definition.
 *
 * Discriminated on `domain` as well as `kind`: a `contentrain_content_list`
 * response also carries `"kind": "collection"`, and an earlier version of this
 * test flagged one. Every model definition has a domain; no response does.
 * Both json and ts fences — the mcp.md example is annotated `ts`.
 */
function modelExamples(markdown: string): string[] {
  return [...markdown.matchAll(/```(?:json|ts)\n([\s\S]*?)```/g)]
    .map(m => m[1]!)
    .filter(b => /"kind":\s*"(singleton|collection|document|dictionary)"/.test(b)
      && /"domain":/.test(b))
}

describe.skipIf(!existsSync(DOCS))('docs parity — ModelDefinition', () => {
  it('reference/config.md declares every key, with matching optionality', () => {
    const doc = read('reference', 'config.md')
    const iface = [...doc.matchAll(/```ts\n([\s\S]*?)```/g)]
      .map(m => m[1]!)
      .find(b => b.includes('interface ModelDefinition'))
    expect(iface, 'reference/config.md no longer documents interface ModelDefinition').toBeDefined()

    for (const key of MODEL_FIELD_ORDER) {
      const required = new RegExp(`^\\s*${key}\\s*:`, 'm').test(iface!)
      const optional = new RegExp(`^\\s*${key}\\s*\\?:`, 'm').test(iface!)
      expect(required || optional, `config.md's ModelDefinition omits \`${key}\``).toBe(true)
    }
    // Direction matters both ways: a key documented as optional that is not,
    // or vice versa, is the same drift.
    expect(/^\s*title_field\s*:/m.test(iface!), 'config.md shows title_field as optional').toBe(true)
    expect(/^\s*description\s*\?:/m.test(iface!), 'config.md shows description as required').toBe(true)
  })

  // Generic on purpose: this covers the examples that exist today and any
  // example added later, without anyone remembering to extend the test.
  it.each([
    ['reference/model-kinds.md', ['reference', 'model-kinds.md']],
    ['guides/first-model.md', ['guides', 'first-model.md']],
    ['guides/normalize.md', ['guides', 'normalize.md']],
    ['packages/mcp.md', ['packages', 'mcp.md']],
  ])('%s shows title_field in every model example', (label, parts) => {
    const examples = modelExamples(read(...parts))
    expect(examples.length, `${label} has no model examples — did the page move?`).toBeGreaterThan(0)
    for (const block of examples) {
      const kind = /"kind":\s*"(\w+)"/.exec(block)![1]
      expect(block.includes('"title_field"'),
        `${label}: a ${kind} example omits title_field:\n${block.slice(0, 240)}`).toBe(true)
    }
  })

  it('packages/types.md constructs a valid ModelDefinition', () => {
    expect(read('packages', 'types.md')).toContain('title_field')
  })

  it('llms.txt tells an agent about title_field', () => {
    expect(read('public', 'llms.txt')).toContain('title_field')
  })
})

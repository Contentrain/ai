import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { TOOL_NAMES } from '@contentrain/mcp/tools/annotations'
import { MODEL_PROPERTIES } from '@contentrain/rules'

/**
 * Cross-package parity tests.
 *
 * `@contentrain/skills` ships the canonical MCP tool reference and the
 * workflow / normalize guides that agents load on demand. `@contentrain/mcp`
 * is the runtime authority. Without these tests, drift creeps in: for a
 * while, the reference jumped from `contentrain_submit` straight to
 * `contentrain_bulk` with no `contentrain_merge` section, and normalize
 * SKILL.md taught the legacy `contentrain/normalize/*` branch pattern
 * after MCP switched to `cr/*`.
 *
 * The tests below fail loudly whenever either side moves without the
 * other. Fix by aligning — not by muting the test.
 */

const PKG_ROOT = join(import.meta.dirname, '..')
const TOOL_REF = join(PKG_ROOT, 'skills', 'contentrain', 'references', 'mcp-tools.md')

describe('MCP parity — tool reference coverage', () => {
  it('references/mcp-tools.md has a section for every MCP tool', () => {
    const content = readFileSync(TOOL_REF, 'utf-8')
    const missing: string[] = []
    for (const tool of TOOL_NAMES) {
      const header = new RegExp(`^###\\s+${tool}\\b`, 'mu')
      if (!header.test(content)) missing.push(tool)
    }
    expect(missing, `missing heading "### <tool>" in references/mcp-tools.md for: ${missing.join(', ')}`).toEqual([])
  })
})

describe('MCP parity — branch naming', () => {
  it('skills docs do not reference the legacy `contentrain/<operation>/` branch prefix', () => {
    // The `.contentrain/` directory path is correct — only the branch
    // prefix is stale. Filter accordingly so we don't false-positive on
    // real filesystem paths.
    const filesToScan = [
      'skills/contentrain/references/mcp-pipelines.md',
      'skills/contentrain/references/workflow.md',
      'skills/contentrain/references/mcp-tools.md',
      'skills/contentrain-normalize/SKILL.md',
      'skills/contentrain-normalize/references/extraction.md',
      'skills/contentrain-normalize/references/reuse.md',
      'skills/contentrain-translate/SKILL.md',
    ]
    const legacyPattern = /(^|[^.])contentrain\/(content|model|normalize|new|fix|review)\b/gmu
    const violations: Record<string, string[]> = {}
    for (const rel of filesToScan) {
      const content = readFileSync(join(PKG_ROOT, rel), 'utf-8')
      const matches = [...content.matchAll(legacyPattern)].map(m => m[0].trim())
      if (matches.length > 0) violations[rel] = matches
    }
    expect(violations, `legacy branch prefix found: ${JSON.stringify(violations, null, 2)}`).toEqual({})
  })
})

/**
 * Model-definition parity for the skill docs.
 *
 * Same gap as the rules package had: nothing failed when a `ModelDefinition`
 * property never reached the skill an agent actually reads before writing a
 * model. The `workflows/` copies are checked too — they are hand-maintained
 * duplicates of the SKILL.md files with no script keeping them in sync, so a
 * property added to one and not the other is exactly the drift to catch.
 */
describe('MCP parity — ModelDefinition properties', () => {
  const REQUIRED = MODEL_PROPERTIES.filter(p => p.required).map(p => p.name)
  const read = (...parts: string[]) => readFileSync(join(PKG_ROOT, ...parts), 'utf-8')

  it('the model_save parameter table documents every property', () => {
    const doc = read('skills', 'contentrain', 'references', 'mcp-tools.md')
    const section = doc.split('### contentrain_model_save')[1]?.split(/^###\s/m)[0] ?? ''

    const rows = new Map<string, string>()
    for (const m of section.matchAll(/^\|\s*`([a-z0-9_]+)`\s*\|[^|]*\|\s*([^|]+?)\s*\|/gm)) {
      rows.set(m[1]!, m[2]!)
    }

    for (const prop of MODEL_PROPERTIES) {
      // `fields` is documented per-kind in this table, not as a flat Yes/No.
      if (prop.name === 'fields') continue
      const required = rows.get(prop.name)
      expect(required, `mcp-tools.md model_save table has no row for \`${prop.name}\``).toBeDefined()
      expect(required!.startsWith(prop.required ? 'Yes' : 'No'),
        `\`${prop.name}\` is ${prop.required ? 'required' : 'optional'} but the table says "${required}"`).toBe(true)
    }
  })

  it.each([
    ['skills/contentrain-model/SKILL.md', ['skills', 'contentrain-model', 'SKILL.md']],
    ['workflows/contentrain-model.md', ['workflows', 'contentrain-model.md']],
    ['skills/contentrain/references/architecture.md', ['skills', 'contentrain', 'references', 'architecture.md']],
    ['skills/contentrain/references/model-kinds.md', ['skills', 'contentrain', 'references', 'model-kinds.md']],
  ])('%s teaches title_field', (_label, parts) => {
    expect(read(...parts)).toContain('title_field')
  })

  // Every model example an agent might copy has to be a model that would save.
  it.each([
    ['skills/contentrain/references/model-kinds.md', ['skills', 'contentrain', 'references', 'model-kinds.md']],
    ['skills/contentrain/references/architecture.md', ['skills', 'contentrain', 'references', 'architecture.md']],
    ['skills/contentrain-model/SKILL.md', ['skills', 'contentrain-model', 'SKILL.md']],
    ['workflows/contentrain-model.md', ['workflows', 'contentrain-model.md']],
  ])('%s shows title_field in every model JSON example', (label, parts) => {
    const doc = read(...parts)
    const blocks = [...doc.matchAll(/```json\n([\s\S]*?)```/g)].map(m => m[1]!)
    const modelBlocks = blocks.filter(b => /"kind":\s*"(singleton|collection|document|dictionary)"/.test(b))
    expect(modelBlocks.length, `${label} has no model JSON examples`).toBeGreaterThan(0)
    for (const block of modelBlocks) {
      const kind = /"kind":\s*"(\w+)"/.exec(block)![1]
      expect(block.includes('"title_field":'),
        `${label}: a ${kind} example omits title_field:\n${block.slice(0, 200)}`).toBe(true)
    }
  })

  it('the required set is what @contentrain/rules publishes', () => {
    expect(REQUIRED).toContain('title_field')
  })
})

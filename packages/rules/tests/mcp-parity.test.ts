import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { TOOL_NAMES } from '@contentrain/mcp/tools/annotations'
import { buildBranchName } from '@contentrain/mcp/git/transaction'
import { MODEL_FIELD_ORDER } from '@contentrain/mcp/core/model-manager'
import { MCP_TOOLS, ESSENTIAL_RULES_FILE, MODEL_PROPERTIES } from '../src/index.js'

/**
 * Cross-package parity tests.
 *
 * `@contentrain/rules` publishes a public catalog of tools and branch
 * conventions that agents rely on. `@contentrain/mcp` is the runtime
 * authority. Without this file, the two can (and historically did) drift:
 * the rules catalog sat at 15 tools while MCP advertised 16; the
 * essential rules kept teaching the legacy `contentrain/*` branch
 * namespace after MCP switched to `cr/*`.
 *
 * The tests below fail loudly whenever either side moves without the
 * other. Fix by aligning — not by muting the test.
 */

const PKG_ROOT = join(import.meta.dirname, '..')

describe('MCP parity — tool registry', () => {
  it('MCP_TOOLS matches the MCP annotations registry exactly', () => {
    const rulesSet = new Set(MCP_TOOLS)
    const mcpSet = new Set(TOOL_NAMES)

    const missingFromRules = [...mcpSet].filter(t => !rulesSet.has(t))
    const missingFromMcp = [...rulesSet].filter(t => !mcpSet.has(t))

    expect(missingFromRules, 'tools registered in @contentrain/mcp but missing from @contentrain/rules MCP_TOOLS').toEqual([])
    expect(missingFromMcp, 'tools in @contentrain/rules MCP_TOOLS but not registered in @contentrain/mcp').toEqual([])
    expect(MCP_TOOLS.length).toBe(TOOL_NAMES.length)
  })

  it('essential guardrails document every MCP tool', () => {
    const content = readFileSync(join(PKG_ROOT, ESSENTIAL_RULES_FILE), 'utf-8')
    for (const tool of TOOL_NAMES) {
      expect(content, `essential rules do not mention ${tool}`).toContain(tool)
    }
  })
})

describe('MCP parity — branch naming', () => {
  it('buildBranchName() emits the `cr/` prefix that rules + skills document', () => {
    const samples = [
      buildBranchName('content', 'blog-post', 'en'),
      buildBranchName('model', 'team-member'),
      buildBranchName('normalize/extract', 'marketing'),
      buildBranchName('new', 'scaffold-landing', 'en'),
    ]
    for (const branch of samples) {
      expect(branch, `branch name should start with "cr/": ${branch}`).toMatch(/^cr\//u)
    }
  })

  it('rules docs do not reference the legacy `contentrain/{operation}/` branch prefix', () => {
    // The `.contentrain/` directory path is correct — only the branch
    // prefix is stale. Filter accordingly so the test doesn't
    // false-positive on real filesystem paths.
    const filesToScan = [
      'essential/contentrain-essentials.md',
      'prompts/review-mode.md',
      'prompts/normalize-mode.md',
      'shared/workflow-rules.md',
    ]
    const legacyPattern = /(^|[^.])contentrain\/(content|model|normalize|new|fix|review)\b/gmu
    for (const rel of filesToScan) {
      const content = readFileSync(join(PKG_ROOT, rel), 'utf-8')
      const matches = [...content.matchAll(legacyPattern)]
      expect(matches.length, `legacy "contentrain/<op>/" branch prefix in ${rel}: ${matches.map(m => m[0]).join(', ')}`).toBe(0)
    }
  })
})

/**
 * Model-definition parity.
 *
 * The tool registry has had a parity test for a while; the model schema has
 * not, and it drifted the same way. `title_field` could have landed in
 * `@contentrain/types`, shipped, and never reached `schema-rules.md` — and no
 * test in this repo would have said a word.
 *
 * `MODEL_FIELD_ORDER` is the runtime anchor: it is provably exhaustive over
 * `keyof ModelDefinition` (asserted at compile time in @contentrain/types), so
 * matching against it means matching the type.
 */
describe('MCP parity — ModelDefinition properties', () => {
  const REQUIRED = MODEL_PROPERTIES.filter(p => p.required).map(p => p.name)

  it('MODEL_PROPERTIES matches the canonical key order exactly', () => {
    const rulesSet = new Set(MODEL_PROPERTIES.map(p => p.name))
    const mcpSet = new Set<string>(MODEL_FIELD_ORDER)

    const missingFromRules = [...mcpSet].filter(k => !rulesSet.has(k))
    const missingFromMcp = [...rulesSet].filter(k => !mcpSet.has(k))

    expect(missingFromRules, `in MODEL_FIELD_ORDER but not MODEL_PROPERTIES: ${missingFromRules.join(', ')}`).toEqual([])
    expect(missingFromMcp, `in MODEL_PROPERTIES but not MODEL_FIELD_ORDER: ${missingFromMcp.join(', ')}`).toEqual([])
  })

  it('schema-rules.md §4.1 documents every property with the right requiredness', () => {
    const doc = readFileSync(join(PKG_ROOT, 'shared', 'schema-rules.md'), 'utf-8')
    const section = doc.split('### 4.1 Model Properties')[1]?.split(/^#{3,}/m)[0] ?? ''

    const rows = new Map<string, string>()
    for (const m of section.matchAll(/^\|\s*`([a-z0-9_]+)`\s*\|[^|]*\|\s*([^|]+?)\s*\|/gm)) {
      rows.set(m[1]!, m[2]!)
    }

    for (const prop of MODEL_PROPERTIES) {
      const required = rows.get(prop.name)
      expect(required, `schema-rules.md §4.1 has no row for \`${prop.name}\``).toBeDefined()
      // `startsWith` tolerates a qualified answer like "Yes (except dictionary)".
      expect(required!.startsWith(prop.required ? 'Yes' : 'No'),
        `\`${prop.name}\` is ${prop.required ? 'required' : 'optional'} but §4.1 says "${required}"`).toBe(true)
    }
    const undocumented = [...rows.keys()].filter(k => !MODEL_PROPERTIES.some(p => p.name === k))
    expect(undocumented, `§4.1 documents unknown properties: ${undocumented.join(', ')}`).toEqual([])
  })

  it('the §4 example shows every required property', () => {
    const doc = readFileSync(join(PKG_ROOT, 'shared', 'schema-rules.md'), 'utf-8')
    const example = doc.split('## 4. Model Definition')[1]?.split('```')[1] ?? ''
    for (const name of REQUIRED) {
      expect(example.includes(`"${name}":`), `§4 example is missing "${name}"`).toBe(true)
    }
  })

  it('mcp-usage.md lists every property in the model_save parameter row', () => {
    const doc = readFileSync(join(PKG_ROOT, 'shared', 'mcp-usage.md'), 'utf-8')
    const row = doc.split('\n').find(l => l.includes('`contentrain_model_save`') && l.includes('|')) ?? ''
    for (const prop of MODEL_PROPERTIES) {
      // Optional params are written `name?` in that row.
      const listed = row.includes(`\`${prop.name}\``) || row.includes(`\`${prop.name}?\``)
      expect(listed, `mcp-usage.md model_save row omits \`${prop.name}\``).toBe(true)
    }
  })

  // Not every required property — essentials is a ~150-line guardrail file, and
  // id/name/kind/domain/i18n are evident from any model example. `title_field`
  // is the one an agent will omit, and omitting it fails the write.
  it('the always-loaded essentials teach title_field', () => {
    const essentials = readFileSync(join(PKG_ROOT, ESSENTIAL_RULES_FILE), 'utf-8')
    expect(essentials.includes('title_field'), 'essentials never mentions title_field').toBe(true)
  })
})

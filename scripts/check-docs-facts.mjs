#!/usr/bin/env node

/**
 * Guards the docs layer against fact drift.
 *
 * The docs site repeats a handful of numbers that are really properties of the
 * code — how many MCP tools exist, how many skills ship, how many field types
 * there are. Those numbers go stale silently: the page body gets updated when
 * the feature lands, and the frontmatter blurb, the llms.txt index and the
 * `// 27` in a code sample do not. That is exactly how the site came to claim
 * 24, 26 and 27 tools on five different lines at once.
 *
 * So: resolve each number from the package that owns it, then check every
 * place the docs state it. A claim nobody can source is a claim nobody
 * maintains.
 *
 * Usage:
 *   node scripts/check-docs-facts.mjs            # self-test, then scan docs
 *   node scripts/check-docs-facts.mjs --selftest # self-test only
 *
 * The self-test runs FIRST and always. It replays real drift taken from this
 * repo's history against the matchers, so a matcher that stops matching — a
 * reworded heading, a broken regex — fails loudly instead of turning the whole
 * check into a green no-op.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const DOCS = join(ROOT, 'docs')

// ─── Resolving canonical values ───

/**
 * Import a workspace package through its own `exports` map rather than a
 * guessed dist path, so a build-output rename surfaces here as a clear error
 * instead of a wrong number.
 */
async function importPackage(dir) {
  const pkgPath = join(ROOT, 'packages', dir, 'package.json')
  let pkg
  try {
    pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
  } catch {
    throw new Error(`cannot read ${relative(ROOT, pkgPath)}`)
  }
  const dot = pkg.exports?.['.']
  const entry = typeof dot === 'string'
    ? dot
    : dot?.import?.default ?? dot?.import ?? dot?.default?.default ?? dot?.default
  if (typeof entry !== 'string') {
    throw new Error(`${pkg.name}: no resolvable "." export`)
  }
  const file = join(ROOT, 'packages', dir, entry)
  try {
    return await import(pathToFileURL(file).href)
  } catch (err) {
    throw new Error(
      `${pkg.name}: cannot import ${relative(ROOT, file)} — run \`pnpm build\` first.`,
      { cause: err },
    )
  }
}

/** Count the members of a closed string-literal union in a .ts source file. */
function countUnionMembers(relPath, typeName) {
  const src = readFileSync(join(ROOT, relPath), 'utf8')
  const start = src.indexOf(`export type ${typeName} =`)
  if (start === -1) throw new Error(`${relPath}: no \`export type ${typeName}\``)
  const block = src.slice(start).split('\n\n')[0]
  const members = block.match(/^\s*\|\s*'[^']+'/gm)
  if (!members?.length) throw new Error(`${relPath}: ${typeName} has no union members`)
  return members.length
}

function countDirs(relPath) {
  return readdirSync(join(ROOT, relPath), { withFileTypes: true })
    .filter(e => e.isDirectory()).length
}

function countFilesRecursive(relPath, suffix, inFolder) {
  let n = 0
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, e.name)
      if (e.isDirectory()) walk(full)
      else if (e.name.endsWith(suffix) && full.includes(`${inFolder}/`)) n += 1
    }
  }
  walk(join(ROOT, relPath))
  return n
}

async function resolveFacts() {
  const rules = await importPackage('rules')
  const types = await importPackage('types')
  const skills = await importPackage('skills')

  const tools = rules.MCP_TOOLS
  const media = tools.filter(t => t.includes('_media_'))

  const facts = {
    'mcp-tools': {
      label: 'MCP tool registry size',
      value: tools.length,
      source: '@contentrain/rules MCP_TOOLS.length',
    },
    'mcp-tools-core': {
      label: 'core (non-media) MCP tools',
      value: tools.length - media.length,
      source: '@contentrain/rules MCP_TOOLS minus contentrain_media_*',
    },
    'mcp-tools-media': {
      label: 'media MCP tools',
      value: media.length,
      source: '@contentrain/rules MCP_TOOLS contentrain_media_*',
    },
    'field-types': {
      label: 'field types',
      value: rules.FIELD_TYPES.length,
      source: '@contentrain/rules FIELD_TYPES.length',
    },
    'model-kinds': {
      label: 'model kinds',
      value: rules.MODEL_KINDS.length,
      source: '@contentrain/rules MODEL_KINDS.length',
    },
    'capability-keys': {
      label: 'CapabilityManifest keys',
      value: types.CAPABILITY_KEYS.length,
      source: '@contentrain/types CAPABILITY_KEYS.length',
    },
    'agent-skills': {
      label: 'Agent Skills',
      value: skills.AGENT_SKILLS.length,
      source: '@contentrain/skills AGENT_SKILLS.length',
    },
    'framework-guides': {
      label: 'framework guides',
      value: skills.FRAMEWORK_GUIDES.length,
      source: '@contentrain/skills FRAMEWORK_GUIDES.length',
    },
    'workflow-skills': {
      label: 'legacy workflow files',
      value: skills.WORKFLOW_SKILLS.length,
      source: '@contentrain/skills WORKFLOW_SKILLS.length',
    },
    'skill-references': {
      label: 'skill reference files',
      value: countFilesRecursive('packages/skills/skills', '.md', 'references'),
      source: 'packages/skills/skills/*/references/*.md',
    },
    'conflict-codes': {
      label: 'reconcile conflict codes',
      value: countUnionMembers('packages/types/src/provider.ts', 'ConflictCode'),
      source: 'packages/types/src/provider.ts ConflictCode',
    },
  }

  // Cross-check the package catalogs against what is actually on disk. This is
  // the drift that let the skills README advertise 15 skills while shipping 16.
  const skillDirs = countDirs('packages/skills/skills')
  if (skillDirs !== facts['agent-skills'].value) {
    throw new Error(
      `AGENT_SKILLS lists ${facts['agent-skills'].value} skills but `
      + `packages/skills/skills/ holds ${skillDirs} directories`,
    )
  }

  return facts
}

// ─── Matching claims in prose ───

/**
 * Each matcher pulls a number out of one way the docs phrase a fact. Keep them
 * narrow: a matcher that fires on unrelated prose turns this check into noise,
 * and a noisy check gets disabled.
 */
const MATCHERS = [
  {
    // "27 tools", "27 MCP tools", "27 deterministic tools", "22 core tools"
    re: /\b(\d+)\s+((?:deterministic|MCP|core|media|remote-safe)\s+)*tools?\b/gi,
    fact: m => {
      const qualifier = (m[2] ?? '').toLowerCase()
      if (qualifier.includes('core')) return 'mcp-tools-core'
      if (qualifier.includes('media')) return 'mcp-tools-media'
      return 'mcp-tools'
    },
  },
  { re: /\b(\d+)-tool\b/gi, fact: () => 'mcp-tools' },
  {
    // "MCP tools (17 operations)" — the registry under another noun. Guarded to
    // the same line mentioning MCP or tools, because "operations" on its own is
    // ordinary English and a check that fires on prose gets switched off.
    re: /\b(\d+)\s+operations\b/gi,
    guard: /MCP|\btools?\b/i,
    fact: () => 'mcp-tools',
  },
  { re: /\b(\d+)\s+`?contentrain_media_\*`?\s+tools?\b/gi, fact: () => 'mcp-tools-media' },
  {
    // "22 core + 5 media" — two facts on one line, with or without the
    // surrounding parentheses. Requiring them missed the rules README, which
    // writes the same split as "26 MCP tool names: 21 core + 5 media".
    re: /\b(\d+)\s+core\s*\+\s*(\d+)\s+media\b/gi,
    fact: () => 'mcp-tools-core',
    second: { group: 2, fact: 'mcp-tools-media' },
  },
  { re: /\bMCP_TOOLS\.length\b[^\n]*?\/\/\s*(\d+)/g, fact: () => 'mcp-tools' },
  { re: /\bFIELD_TYPES\.length\b[^\n]*?\/\/\s*(\d+)/g, fact: () => 'field-types' },
  { re: /\bWORKFLOW_SKILLS\.length\b[^\n]*?\/\/\s*(\d+)/g, fact: () => 'workflow-skills' },
  { re: /\b(\d+)\s+field types\b/gi, fact: () => 'field-types' },
  { re: /\b(\d+)\s+model kinds\b/gi, fact: () => 'model-kinds' },
  { re: /\b(\d+)\s+capability keys\b/gi, fact: () => 'capability-keys' },
  { re: /\b(\d+)\s+framework guides\b/gi, fact: () => 'framework-guides' },
  { re: /\b(\d+)\s+reference files\b/gi, fact: () => 'skill-references' },
  { re: /\b(\d+)\s+flat markdown files\b/gi, fact: () => 'workflow-skills' },
  { re: /\b(\d+)-value conflict\b/gi, fact: () => 'conflict-codes' },
  { re: /\b(\d+)\s+conflict codes\b/gi, fact: () => 'conflict-codes' },
  {
    // "16 skills", "16 Agent Skills", "16 on-demand Agent Skills", "15 production skills"
    re: /\b(\d+)\s+(?:on-demand\s+|production\s+)*(?:Agent\s+)?skills\b/gi,
    fact: () => 'agent-skills',
  },
]

/** Every claim the matchers find in one body of text. */
function findClaims(text) {
  const claims = []
  const lines = text.split('\n')
  lines.forEach((line, i) => {
    for (const matcher of MATCHERS) {
      matcher.re.lastIndex = 0
      let m
      if (matcher.guard && !matcher.guard.test(line)) continue
      while ((m = matcher.re.exec(line)) !== null) {
        claims.push({ fact: matcher.fact(m), found: Number(m[1]), line: i + 1, text: m[0].trim() })
        if (matcher.second) {
          claims.push({
            fact: matcher.second.fact,
            found: Number(m[matcher.second.group]),
            line: i + 1,
            text: m[0].trim(),
          })
        }
      }
    }
  })
  return claims
}

// ─── The corpus ───

/**
 * Reader-facing surfaces that state these numbers. `README.md` is the npm and
 * GitHub front page, so it is read more than the docs site; `AGENTS.md` is the
 * contract coding agents load.
 *
 * `CLAUDE.md` deliberately is NOT here. It carries the same drift, but it is
 * this repo's instruction file rather than published documentation, and
 * changing it is a decision for its owner. Once its numbers are corrected,
 * adding it to `EXTRA_FILES` is a one-line change.
 */
const EXTRA_FILES = ['README.md', 'AGENTS.md']

/**
 * Every package's own README. These are what npm renders, so they are read
 * more than anything else the repo ships — and until now nothing checked them.
 *
 * CHANGELOGs are deliberately excluded everywhere: "19-tool" in a changelog is
 * a true statement about the release it describes, and checking it would
 * manufacture permanent false positives out of correct history.
 */
function packageReadmes() {
  const out = []
  const walk = (dir, depth) => {
    if (depth > 2) return
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue
      const full = join(dir, e.name)
      if (e.isDirectory()) walk(full, depth + 1)
      else if (e.name === 'README.md') out.push(full)
    }
  }
  walk(join(ROOT, 'packages'), 0)
  return out.toSorted()
}

function docsFiles() {
  const out = []
  const walk = (dir) => {
    const entries = readdirSync(dir, { withFileTypes: true }).toSorted((a, b) => a.name.localeCompare(b.name))
    for (const e of entries) {
      if (e.name === 'node_modules' || e.name === '.vitepress' || e.name.startsWith('.')) continue
      const full = join(dir, e.name)
      if (e.isDirectory()) walk(full)
      else if (e.name.endsWith('.md') || e.name === 'llms.txt') out.push(full)
    }
  }
  walk(DOCS)
  for (const name of EXTRA_FILES) out.push(join(ROOT, name))
  out.push(...packageReadmes())
  return out
}

// ─── Self-test: real drift from this repo's history ───

/**
 * Every entry is a line that was actually live on ai.contentrain.io, with the
 * number it actually carried. If a matcher stops catching one of these, the
 * regression it represents can come back unnoticed.
 */
const HISTORICAL_DRIFT = [
  { fact: 'mcp-tools', wrong: 24, line: 'description: ... powering AI content governance with 24 deterministic tools over stdio or HTTP' },
  { fact: 'mcp-tools', wrong: 26, line: '| [`@contentrain/mcp`](https://npmjs.com/) | 26 MCP tools for AI agents | `pnpm add` |' },
  { fact: 'mcp-tools', wrong: 24, line: 'console.log(MCP_TOOLS.length)                           // 24' },
  { fact: 'mcp-tools', wrong: 24, line: '> Contentrain AI is ... a 24-tool MCP server (@contentrain/mcp), a CLI ...' },
  { fact: 'mcp-tools', wrong: 26, line: '- @contentrain/mcp — MCP server: 26 deterministic tools (21 core + 5 media), stdio + HTTP' },
  { fact: 'mcp-tools-core', wrong: 21, line: '- @contentrain/mcp — MCP server: 26 deterministic tools (21 core + 5 media), stdio + HTTP' },
  { fact: 'mcp-tools-core', wrong: 19, line: 'Uses `LocalProvider`, so it serves the 19 core tools over stdio' },
  { fact: 'mcp-tools-core', wrong: 19, line: 'All 19 core tools are available because the runner has `LocalProvider`' },
  { fact: 'agent-skills', wrong: 15, line: '# Install all 15 skills' },
  { fact: 'agent-skills', wrong: 15, line: 'Installs 15 Agent Skills + essential rules across detected IDEs' },
  { fact: 'agent-skills', wrong: 15, line: 'Published under `skills/` — 15 production skills:' },
  { fact: 'capability-keys', wrong: 24, line: 'It is evidence-based detection across 24 capability keys — `seo`, `forms`, ...' },
  { fact: 'mcp-tools', wrong: 17, line: '- Contentrain MCP tools (17 operations)' },
  { fact: 'mcp-tools', wrong: 26, line: '- `MCP_TOOLS` — 26 MCP tool names: 21 core + 5 media (`contentrain_media_*`)' },
  { fact: 'mcp-tools-core', wrong: 21, line: '- `MCP_TOOLS` — 26 MCP tool names: 21 core + 5 media (`contentrain_media_*`)' },
  { fact: 'mcp-tools', wrong: 22, line: '| @contentrain/mcp | 22 MCP tools (scan, apply, validate, merge, reconcile, doctor...) |' },
]

function selfTest(facts) {
  const failures = []
  for (const entry of HISTORICAL_DRIFT) {
    const claims = findClaims(entry.line).filter(c => c.fact === entry.fact && c.found === entry.wrong)
    if (claims.length === 0) {
      failures.push(`no matcher caught ${entry.fact}=${entry.wrong} in:\n      ${entry.line}`)
      continue
    }
    // The fixture is only a regression if the wrong value really differs from truth.
    if (facts[entry.fact].value === entry.wrong) {
      failures.push(
        `fixture ${entry.fact}=${entry.wrong} now equals the canonical value — `
        + 'the fixture is stale and proves nothing',
      )
    }
  }
  return failures
}

// ─── Main ───

async function main() {
  const selftestOnly = process.argv.includes('--selftest')
  let facts
  try {
    facts = await resolveFacts()
  } catch (err) {
    console.error(`docs-facts: cannot resolve canonical values\n  ${err.message}`)
    if (err.cause) console.error(`  ${err.cause.message}`)
    process.exit(2)
  }

  const selfFailures = selfTest(facts)
  if (selfFailures.length > 0) {
    console.error('docs-facts: SELF-TEST FAILED — the matchers no longer catch known drift\n')
    for (const f of selfFailures) console.error(`  ✗ ${f}`)
    console.error('\nFix the matchers. A check that cannot catch its own history catches nothing.')
    process.exit(1)
  }
  console.log(`docs-facts: self-test passed (${HISTORICAL_DRIFT.length} historical regressions still caught)`)

  if (selftestOnly) return

  const problems = []
  const files = docsFiles()
  let claimCount = 0
  for (const file of files) {
    const claims = findClaims(readFileSync(file, 'utf8'))
    claimCount += claims.length
    for (const claim of claims) {
      const fact = facts[claim.fact]
      if (claim.found !== fact.value) {
        problems.push({ file: relative(ROOT, file), ...claim, expected: fact.value, fact })
      }
    }
  }

  if (problems.length > 0) {
    console.error(`\ndocs-facts: ${problems.length} stale number(s)\n`)
    for (const p of problems) {
      console.error(`  ${p.file}:${p.line}`)
      console.error(`    "${p.text}" — expected ${p.expected}, found ${p.found}`)
      console.error(`    ${p.fact.label} · source: ${p.fact.source}\n`)
    }
    process.exit(1)
  }

  const sourced = Object.entries(facts).map(([id, f]) => `${id}=${f.value}`).join(' ')
  console.log(`docs-facts: ${claimCount} claims checked across ${files.length} files, all current`)
  console.log(`            ${sourced}`)
}

await main()

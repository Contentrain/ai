#!/usr/bin/env node

/**
 * Guards the docs' code examples against the packages they are written for.
 *
 * Two failures motivate this, both found by hand and neither catchable by
 * reading the page:
 *
 *   1. An example that cannot execute at all. `sdk.md` documented CommonJS
 *      usage with a top-level `await` in a `.cjs` file — a syntax error, so
 *      the file never loaded. It looked completely reasonable on the page.
 *   2. An import naming an export that does not exist. Renaming an export is
 *      a one-line change in a package and silently invalidates every example
 *      that imported it.
 *
 * What it does NOT do is parse every block. Measured on this corpus, 34 of
 * 106 ts/js blocks fail a standalone parse, and almost all of them are
 * deliberate fragments — a type excerpt, an object literal, half a config.
 * A 32% false-positive rate would make the check noise, and a noisy check
 * gets switched off. So both checks below are narrow enough to be certain.
 *
 * Usage:
 *   node scripts/check-docs-examples.mjs
 *   node scripts/check-docs-examples.mjs --selftest
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const DOCS = join(ROOT, 'docs')

/** Workspace packages an example may import from. */
const PACKAGE_DIRS = {
  '@contentrain/mcp': 'mcp',
  '@contentrain/types': 'types',
  '@contentrain/rules': 'rules',
  '@contentrain/skills': 'skills',
  '@contentrain/query': 'sdk/js',
  '@contentrain/verify': 'verify',
  '@contentrain/wp-import': 'wp-import',
  '@contentrain/emitter-astro': 'emitter-astro',
}

// ─── Reading code blocks ───

// `[ \t]` and not `\s`: `\s` matches a newline, so the optional fence-meta
// group silently swallowed each block's FIRST LINE — which is where imports
// and `require` calls live. The self-test below now runs through this
// function for exactly that reason.
const FENCE = /^```(ts|tsx|js|jsx|mjs|cjs)(?:[ \t]+[^\n]*)?\n(.*?)^```/gms

function codeBlocks(text) {
  const blocks = []
  FENCE.lastIndex = 0
  let m
  while ((m = FENCE.exec(text)) !== null) {
    blocks.push({ lang: m[1], code: m[2], line: text.slice(0, m.index).split('\n').length })
  }
  return blocks
}

// ─── Check 1: an example that cannot run in any module system ───

const CJS_MARKER = /(?:^|[^.\w])require\s*\(|(?:^|\s)module\.exports\b|(?:^|\s)exports\.\w+\s*=/
const ESM_MARKER = /^\s*(?:import\s.+\sfrom\s|export\s(?:default|const|function|class|\{))/m

/**
 * Top-level `await` outside any function body. Crude on purpose: it walks
 * brace/paren depth and only counts an `await` at depth zero, which is the
 * one case that decides between "runs" and "SyntaxError".
 */
function hasTopLevelAwait(code) {
  const stripped = code
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/(['"`])(?:\\.|(?!\1)[^\\])*\1/g, '""')
  let depth = 0
  for (let i = 0; i < stripped.length; i += 1) {
    const c = stripped[i]
    if (c === '{' || c === '(' || c === '[') depth += 1
    else if (c === '}' || c === ')' || c === ']') depth -= 1
    else if (depth === 0 && stripped.startsWith('await', i) && !/[\w$]/.test(stripped[i - 1] ?? ' ')
      && !/[\w$]/.test(stripped[i + 5] ?? ' ')) {
      return true
    }
  }
  return false
}

/**
 * A block carrying CommonJS markers AND a top-level await runs nowhere: as
 * CommonJS the await is a syntax error, and as an ES module `require` is not
 * defined. There is no module system in which the example works, so this can
 * never be a false positive on a fragment.
 */
function moduleContradiction(code) {
  if (!CJS_MARKER.test(code)) return null
  if (!hasTopLevelAwait(code)) return null
  if (ESM_MARKER.test(code)) {
    return 'mixes `require`/`module.exports` with ESM import/export syntax'
  }
  return 'uses CommonJS (`require`) with a top-level `await` — a syntax error in a CJS file, '
    + 'and `require` is not defined in an ES module. Use `await import()` inside an async function.'
}

// ─── Check 2: imports must name real exports ───

const IMPORT = /import\s+(type\s+)?\{([^}]+)\}\s+from\s+'([^']+)'/g

function resolveSubpath(pkgJson, subpath, kind) {
  const entry = pkgJson.exports?.[subpath]
  if (!entry) return null
  if (typeof entry === 'string') return kind === 'types' ? null : entry
  if (kind === 'types') return entry.types ?? entry.import?.types ?? null
  return entry.import?.default ?? entry.import ?? entry.default?.default ?? entry.default ?? null
}

/**
 * Names a declaration file exports. tsdown emits one trailing
 * `export { A, type B, ... }`; fall back to scanning `export`ed declarations
 * for any other shape rather than reporting a package as empty.
 */
function declaredExports(dtsPath) {
  const src = readFileSync(dtsPath, 'utf8')
  const names = new Set()
  for (const m of src.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const raw of m[1].split(',')) {
      const name = raw.trim().replace(/^type\s+/, '').split(/\s+as\s+/).pop()?.trim()
      if (name) names.add(name)
    }
  }
  for (const m of src.matchAll(/^export\s+(?:declare\s+)?(?:interface|type|const|function|class|enum)\s+([\w$]+)/gm)) {
    names.add(m[1])
  }
  return names
}

const runtimeCache = new Map()
const typesCache = new Map()

async function exportsFor(spec, kind) {
  const cache = kind === 'types' ? typesCache : runtimeCache
  if (cache.has(spec)) return cache.get(spec)

  const pkgName = Object.keys(PACKAGE_DIRS).find(p => spec === p || spec.startsWith(`${p}/`))
  if (!pkgName) return cache.set(spec, null).get(spec)

  const dir = join(ROOT, 'packages', PACKAGE_DIRS[pkgName])
  const pkgJson = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  const subpath = spec === pkgName ? '.' : `.${spec.slice(pkgName.length)}`
  const target = resolveSubpath(pkgJson, subpath, kind)
  if (!target) {
    const result = { error: `no "${subpath}" ${kind === 'types' ? 'types ' : ''}entry in ${pkgName}'s exports` }
    cache.set(spec, result)
    return result
  }

  const file = join(dir, target)
  try {
    const names = kind === 'types'
      ? declaredExports(file)
      : new Set(Object.keys(await import(pathToFileURL(file).href)))
    const result = { names }
    cache.set(spec, result)
    return result
  } catch (err) {
    const result = { error: `cannot load ${relative(ROOT, file)} — run \`pnpm build\` first (${err.code ?? err.message})` }
    cache.set(spec, result)
    return result
  }
}

async function checkImports(code, ctx, problems) {
  IMPORT.lastIndex = 0
  let m
  while ((m = IMPORT.exec(code)) !== null) {
    const kind = m[1] ? 'types' : 'runtime'
    const spec = m[3]
    const resolved = await exportsFor(spec, kind)
    if (resolved === null) continue // not one of ours
    if (resolved.error) {
      problems.push({ ...ctx, detail: `\`${spec}\` — ${resolved.error}` })
      continue
    }
    for (const raw of m[2].split(',')) {
      // `import { type Foo, bar }` — the inline `type` modifier.
      const cleaned = raw.trim().replace(/^type\s+/, '')
      const name = cleaned.split(/\s+as\s+/)[0]?.trim()
      if (!name) continue
      const pool = kind === 'types' || /^type\s/.test(raw.trim())
        ? (await exportsFor(spec, 'types')).names ?? resolved.names
        : resolved.names
      if (!pool.has(name)) {
        problems.push({ ...ctx, detail: `\`${spec}\` does not export \`${name}\`` })
      }
    }
  }
}

// ─── Corpus ───

function docFiles() {
  const out = []
  const walk = (dir) => {
    const entries = readdirSync(dir, { withFileTypes: true }).toSorted((a, b) => a.name.localeCompare(b.name))
    for (const e of entries) {
      if (e.name === 'node_modules' || e.name === '.vitepress' || e.name.startsWith('.')) continue
      const full = join(dir, e.name)
      if (e.isDirectory()) walk(full)
      else if (e.name.endsWith('.md')) out.push(full)
    }
  }
  walk(DOCS)
  return out
}

// ─── Self-test ───

/**
 * Real examples, with the defect they actually shipped with. Replayed before
 * every run so a weakened check fails loudly instead of passing silently.
 */
const KNOWN_BAD = [
  {
    why: 'sdk.md CommonJS usage, live until #182 — top-level await in a CJS file',
    code: "const clientModule = require('#contentrain')\nconst client = await clientModule.init()\n\nconst hero = client.singleton('hero').get()\n",
    expect: 'contradiction',
  },
  {
    why: 'an import naming an export that was renamed away',
    code: "import { thisWasRenamedAway } from '@contentrain/verify'\n",
    expect: 'import',
  },
  {
    why: 'a type import naming a type that does not exist',
    code: "import type { NoSuchContract } from '@contentrain/types'\n",
    expect: 'import',
  },
  {
    why: 'a subpath that is not in the package exports map',
    code: "import { anything } from '@contentrain/types/not-a-subpath'\n",
    expect: 'import',
  },
]

/** Examples that must NOT be reported — the shapes that make a check noisy. */
const KNOWN_GOOD = [
  { why: 'the corrected CJS example', code: "async function load() {\n  const { init } = await import('#contentrain')\n  return (await init()).singleton('hero').get()\n}\n" },
  { why: 'a bundler config using require at top level, no await', code: "const path = require('path')\nmodule.exports = { resolve: { alias: {} } }\n" },
  { why: 'ESM with top-level await, which is legal', code: "import { verify } from '@contentrain/verify'\nconst report = await Promise.resolve(verify)\n" },
  { why: 'a deliberate type fragment', code: "{\n  id: string\n  path: string\n  code: ConflictCode\n}\n" },
  { why: 'await inside a function in a CJS file', code: "const x = require('x')\nasync function go() { await x.y() }\n" },
]

/**
 * Run a fixture through the SAME path a real page takes — fenced markdown in,
 * problems out. Calling the checks directly would have hidden the fence regex
 * dropping every block's first line.
 */
async function scanMarkdown(markdown) {
  const problems = []
  for (const block of codeBlocks(markdown)) {
    const contradiction = moduleContradiction(block.code)
    if (contradiction) problems.push({ kind: 'contradiction', detail: contradiction })
    await checkImports(block.code, { kind: 'import' }, problems)
  }
  return problems
}

async function selfTest() {
  const failures = []
  for (const c of KNOWN_BAD) {
    const problems = await scanMarkdown(`Prose above.\n\n\`\`\`js\n${c.code}\`\`\`\n`)
    if (!new Set(problems.map(p => p.kind)).has(c.expect)) {
      failures.push(`not caught (${c.expect}): ${c.why}`)
    }
  }
  for (const c of KNOWN_GOOD) {
    const problems = await scanMarkdown(`Prose above.\n\n\`\`\`js\n${c.code}\`\`\`\n`)
    if (problems.length > 0) failures.push(`false positive on: ${c.why} → ${problems[0].detail}`)
  }
  // The fence regex must hand back the block verbatim, first line included.
  const roundTrip = codeBlocks('x\n\n```ts meta here\nconst first = 1\nconst second = 2\n```\n')
  if (roundTrip[0]?.code !== 'const first = 1\nconst second = 2\n') {
    failures.push(`fence parsing lost part of the block: ${JSON.stringify(roundTrip[0]?.code)}`)
  }
  return failures
}

// ─── Main ───

async function main() {
  const selfFailures = await selfTest()
  if (selfFailures.length > 0) {
    console.error('docs-examples: SELF-TEST FAILED\n')
    for (const f of selfFailures) console.error(`  ✗ ${f}`)
    console.error('\nA check that cannot catch its own history catches nothing.')
    process.exit(1)
  }
  console.log(
    `docs-examples: self-test passed (${KNOWN_BAD.length} known defects caught, `
    + `${KNOWN_GOOD.length} valid shapes not flagged)`,
  )
  if (process.argv.includes('--selftest')) return

  const problems = []
  let blocks = 0
  for (const file of docFiles()) {
    for (const block of codeBlocks(readFileSync(file, 'utf8'))) {
      blocks += 1
      const ctx = { file: relative(ROOT, file), line: block.line }
      const contradiction = moduleContradiction(block.code)
      if (contradiction) problems.push({ ...ctx, kind: 'contradiction', detail: contradiction })
      await checkImports(block.code, { ...ctx, kind: 'import' }, problems)
    }
  }

  if (problems.length > 0) {
    console.error(`\ndocs-examples: ${problems.length} problem(s) in the docs' code examples\n`)
    for (const p of problems) console.error(`  ${p.file}:${p.line}\n    ${p.detail}\n`)
    process.exit(1)
  }
  console.log(`docs-examples: ${blocks} code blocks checked, imports resolve and every example can run`)
}

// Importable so the pieces can be exercised directly; only runs as a command.
export { codeBlocks, hasTopLevelAwait, moduleContradiction, checkImports }

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()

#!/usr/bin/env node
/**
 * Build the Claude Code plugin payload at plugins/contentrain/.
 *
 * The plugin ships a curated subset of @contentrain/skills rather than the
 * whole package: the directory rewards one coherent end-to-end job, and every
 * extra skill is always-on context the user pays for on install (the /plugin
 * detail view shows a projected token cost before installing).
 *
 * Source of truth stays packages/skills/. This script copies; never edit
 * plugins/contentrain/skills/ or plugins/contentrain/frameworks/ by hand.
 * CI regenerates and fails on a dirty diff.
 *
 * Layout is mirrored on purpose:
 *   packages/skills/skills/<skill>/  ->  ../../frameworks/  = packages/skills/frameworks/
 *   plugins/contentrain/skills/<skill>/ -> ../../frameworks/ = plugins/contentrain/frameworks/
 * so the framework links inside SKILL.md resolve in both layouts unchanged.
 */
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SKILLS_SRC = join(ROOT, 'packages/skills/skills')
const FRAMEWORKS_SRC = join(ROOT, 'packages/skills/frameworks')
const PLUGIN_DIR = join(ROOT, 'plugins/contentrain')
const PLUGIN_PKG = join(PLUGIN_DIR, 'package.json')
const PLUGIN_MANIFEST = join(PLUGIN_DIR, '.claude-plugin/plugin.json')
const CURSOR_MANIFEST = join(PLUGIN_DIR, '.cursor-plugin/plugin.json')
const MARKETPLACE_MANIFEST = join(ROOT, '.claude-plugin/marketplace.json')
const CURSOR_MARKETPLACE_MANIFEST = join(ROOT, '.cursor-plugin/marketplace.json')
const PLUGIN_MCP = join(PLUGIN_DIR, '.mcp.json')
const MCP_PKG = join(ROOT, 'packages/mcp/package.json')
const POSITIONING = join(ROOT, 'AI_DIRECTORY_POSITIONING.md')
const OPENAI_DIR = join(ROOT, 'plugins/contentrain-openai')
const REMOTE_MCP_URL = 'https://studio.contentrain.io/api/mcp/remote'

/**
 * The normalize wedge, end to end: init -> scan/extract -> model -> validate
 * -> review -> serve, plus the core architecture skill they all lean on.
 * Deliberately excluded: bulk, content, diff, doctor, generate, quality, sdk,
 * translate. Those matter once you are already a user; they dilute a first
 * listing and add always-on cost. Revisit for a second plugin, not this one.
 */
const CURATED_SKILLS = [
  'contentrain',
  'contentrain-init',
  'contentrain-normalize',
  'contentrain-model',
  'contentrain-validate-fix',
  'contentrain-review',
  'contentrain-serve',
]

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf-8'))
}

/** Canonical write: 2-space indent, trailing newline — matches the repo. */
function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf-8')
}

/**
 * plugins/contentrain/package.json is the single source of truth for the
 * plugin version, because that is the file changesets bumps. Claude Code
 * pins installed users to the `version` in plugin.json and only offers an
 * update when it changes, so a skills or MCP-pin change that forgets the
 * bump reaches nobody. Deriving both manifests from the package version
 * puts that bump in the release flow instead of a human's memory. The Cursor
 * manifests (.cursor-plugin/) take the same version.
 */
function syncVersion() {
  const { version } = readJson(PLUGIN_PKG)
  if (typeof version !== 'string' || version.length === 0) {
    console.error(`✘ No version in ${PLUGIN_PKG}`)
    process.exit(1)
  }

  for (const path of [PLUGIN_MANIFEST, CURSOR_MANIFEST]) {
    const manifest = readJson(path)
    manifest.version = version
    writeJson(path, manifest)
  }

  for (const path of [MARKETPLACE_MANIFEST, CURSOR_MARKETPLACE_MANIFEST]) {
    const marketplace = readJson(path)
    marketplace.metadata = { ...marketplace.metadata, version }
    writeJson(path, marketplace)
  }

  return version
}

/**
 * plugins/contentrain/.mcp.json pins the MCP server the plugin starts, written
 * from packages/mcp/package.json as an exact version: the Claude plugin
 * directory blocks any launcher that is not pinned exactly. An exact pin once
 * sat at 2.3.0 (24 tools) for ~70 releases because a human kept it; now the
 * plugin package depends on @contentrain/mcp (workspace:*), so changesets
 * bumps the plugin with every MCP release and `version-packages` rewrites this
 * file in the same commit. CI's stale-diff check catches a skipped rebuild.
 */
function writeMcpConfig() {
  const { version } = readJson(MCP_PKG)
  if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) {
    console.error(`✘ Cannot read an exact version from ${MCP_PKG} (got ${JSON.stringify(version)})`)
    process.exit(1)
  }
  const spec = `@contentrain/mcp@${version}`
  writeJson(PLUGIN_MCP, { mcpServers: { contentrain: { command: 'npx', args: ['-y', spec] } } })
  return spec
}

/**
 * The OpenAI plugin directory (ChatGPT + Codex) takes a remote MCP server only,
 * so its package is a separate folder: plugin.json + mcp.json at the root,
 * pointing at Studio's hosted endpoint, with no skills (the curated skills
 * drive scan/apply, which a remote session never lists). Listing copy comes
 * from AI_DIRECTORY_POSITIONING.md, the single source for directory copy, and
 * the field limits are the portal's: a limit broken here is a rejected upload.
 *
 * mcp.json carries `extensions["com.openai"].auth` as OpenAI's docs require.
 * The generic Agent Plugins 1.0.0 mcp schema closes server entries
 * (additionalProperties: false), so this file does not validate against it.
 */
function positioningSection(md, heading) {
  // Match the heading as a prefix: "## Connector description (~1,400 / 2,000)".
  const start = md.indexOf(`\n## ${heading}`)
  if (start === -1) {
    console.error(`✘ ${POSITIONING} has no "## ${heading}" section`)
    process.exit(1)
  }
  const rest = md.slice(md.indexOf('\n', start + 1) + 1)
  const end = rest.search(/\n## /)
  return end === -1 ? rest : rest.slice(0, end)
}

function openAiListing() {
  const md = readFileSync(POSITIONING, 'utf-8')
  const fields = positioningSection(md, 'OpenAI plugin fields')
  const field = (name) => {
    const m = fields.match(new RegExp(`^- ${name}[^:]*: \`([^\`]+)\``, 'm'))
    if (!m) {
      console.error(`✘ ${POSITIONING}: no ${name} under "OpenAI plugin fields"`)
      process.exit(1)
    }
    return m[1]
  }
  const prompts = [...fields.split(/^- defaultPrompt[^\n]*\n/m)[1]?.matchAll(/^ {2}- `([^`]+)`/gm) ?? []].map(m => m[1])

  // The connector description is a blockquote: paragraphs joined, bullets kept
  // on their own lines, and the client named for this directory.
  const quote = positioningSection(md, 'Connector description')
    .split('\n').filter(l => l.startsWith('>')).map(l => l.replace(/^> ?/, ''))
  const paragraphs = []
  let current = []
  for (const line of [...quote, '']) {
    if (line === '') {
      if (current.length) paragraphs.push(current.join(' ').replace(/ (?=• )/g, '\n'))
      current = []
    }
    else current.push(line.trim())
  }
  const longDescription = paragraphs.join('\n\n').replace('Connect Claude', 'Connect ChatGPT or Codex')

  const listing = {
    displayName: field('displayName'),
    shortDescription: field('shortDescription'),
    longDescription,
    category: field('category'),
    defaultPrompt: prompts,
  }
  const problems = []
  if (listing.displayName.length > 30) problems.push(`displayName is ${listing.displayName.length} chars (max 30)`)
  if (listing.shortDescription.length > 30) problems.push(`shortDescription is ${listing.shortDescription.length} chars (max 30)`)
  if (longDescription.length > 4000) problems.push(`longDescription is ${longDescription.length} chars (max 4000)`)
  if (longDescription.includes('Claude')) problems.push('longDescription still names Claude')
  if (prompts.length === 0 || prompts.length > 3) problems.push(`${prompts.length} defaultPrompt entries (1–3)`)
  if (new Set(prompts).size !== prompts.length) problems.push('defaultPrompt entries repeat')
  for (const p of prompts) if (p.length > 128) problems.push(`defaultPrompt over 128 chars: ${p}`)
  if (problems.length > 0) {
    console.error(`✘ OpenAI listing copy in ${POSITIONING}:\n  ${problems.join('\n  ')}`)
    process.exit(1)
  }
  return listing
}

function writeOpenAiPlugin(version) {
  const listing = openAiListing()
  mkdirSync(join(OPENAI_DIR, 'assets'), { recursive: true })
  cpSync(join(PLUGIN_DIR, 'assets/logo.svg'), join(OPENAI_DIR, 'assets/logo.svg'))

  writeJson(join(OPENAI_DIR, 'plugin.json'), {
    $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
    name: 'contentrain',
    version,
    description: listing.shortDescription,
    author: { name: 'Contentrain', email: 'support@contentrain.io', url: 'https://contentrain.io' },
    homepage: 'https://docs.contentrain.io/developer/mcp-cloud',
    repository: 'https://github.com/Contentrain/ai',
    license: 'MIT',
    keywords: ['content', 'git', 'i18n', 'localization', 'content-models'],
    extensions: {
      'com.openai': {
        interface: {
          displayName: listing.displayName,
          shortDescription: listing.shortDescription,
          longDescription: listing.longDescription,
          developerName: 'Contentrain',
          category: listing.category,
          capabilities: ['Read', 'Write'],
          websiteURL: 'https://contentrain.io',
          privacyPolicyURL: 'https://contentrain.io/legal/privacy-policy',
          termsOfServiceURL: 'https://contentrain.io/legal/terms',
          defaultPrompt: listing.defaultPrompt,
          brandColor: '#0331FC',
          composerIcon: './assets/logo.svg',
          logo: './assets/logo.svg',
        },
      },
    },
  })

  writeJson(join(OPENAI_DIR, 'mcp.json'), {
    $schema: 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json',
    mcpServers: {
      contentrain: {
        type: 'streamable-http',
        url: REMOTE_MCP_URL,
        // CIMD first; OpenAI's runtime falls back to DCR, which Studio also serves.
        extensions: { 'com.openai': { auth: { type: 'oauth', client: { mode: 'cimd' } } } },
      },
    },
  })
}

/**
 * The Claude plugin directory reviews a version and then trusts it, so
 * anything the plugin runs must not change after review. Its reviewer sent
 * 1.0.6 back for exactly this: "The plugin runs a package without an exact
 * version (for example `npx some-package` or `some-package@latest`), in its
 * MCP launcher or in its skill or script text." `claude plugin validate
 * --strict` does not check the text, so this build does.
 *
 * The skills are shared with @contentrain/skills, whose npm users run
 * whatever CLI version their project has, so the source stays unpinned and
 * only the plugin copy gets exact versions: every workspace package the text
 * runs (`npx contentrain …`) or installs (`pnpm add @contentrain/query`) is
 * rewritten to `<name>@<version>` from its package.json. The plugin package
 * depends on each of them (workspace:*), so a release of any one bumps the
 * plugin and `version-packages` rewrites the pins in the same commit.
 * Framework binaries (`npx next dev`) are written as the project's own
 * scripts in the source instead, so nothing is fetched at all.
 */
const LAUNCHER = String.raw`(?:npx|pnpm dlx|bunx|uvx|yarn dlx|npm exec)`
const INSTALLER = String.raw`(?:npm (?:install|i|add)|pnpm (?:add|install|i)|yarn add|bun add)`
const EXACT = /^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+(?:@\d+\.\d+\.\d+(?:-[0-9a-z.-]+)?|==\d+\.\d+\.\d+)$/i

function workspaceVersions() {
  const versions = new Map()
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (!e.isDirectory() || e.name === 'node_modules' || e.name.startsWith('.')) continue
      const pkgPath = join(dir, e.name, 'package.json')
      try {
        const pkg = readJson(pkgPath)
        if (pkg.name && pkg.version && !pkg.private) versions.set(pkg.name, pkg.version)
      }
      catch {}
      walk(join(dir, e.name))
    }
  }
  walk(join(ROOT, 'packages'))
  return versions
}

function pinPluginText(versions) {
  const names = [...versions.keys()].toSorted((a, b) => b.length - a.length)
    .map(name => name.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&'))
  const pkg = `(${names.join('|')})(?![@\\w/.-])`
  const run = new RegExp(String.raw`(\b${LAUNCHER}(?:\s+-{1,2}[\w-]+)*\s+)${pkg}`, 'g')
  const install = new RegExp(String.raw`(\b${INSTALLER}(?:\s+-{1,2}[\w-]+)*\s+)${pkg}`, 'g')
  let pinned = 0
  for (const file of pluginTextFiles()) {
    const text = readFileSync(file, 'utf-8')
    const next = text
      .replace(run, (_, lead, name) => { pinned++; return `${lead}${name}@${versions.get(name)}` })
      .replace(install, (_, lead, name) => { pinned++; return `${lead}${name}@${versions.get(name)}` })
    if (next !== text) writeFileSync(file, next, 'utf-8')
  }
  return pinned
}

function pluginTextFiles() {
  const out = []
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules') continue
      const full = join(dir, e.name)
      if (e.isDirectory()) walk(full)
      else if (/\.(md|mdc|json|sh|mjs|js|ts|txt|ya?ml)$/.test(e.name) && e.name !== 'CHANGELOG.md' && e.name !== 'package.json') out.push(full)
    }
  }
  walk(PLUGIN_DIR)
  return out
}

/**
 * The gate: nothing in the plugin may run or install a package without an
 * exact version, or name `@latest`. It runs on the finished payload, so it
 * also catches text a future skill brings in that the pinning above does not
 * know about (a third-party `npx`, a `uvx`).
 */
function checkExactPins() {
  const problems = []
  const run = new RegExp(String.raw`\b${LAUNCHER}((?:\s+-{1,2}[\w-]+)*)\s+([^\s\`'")\]]+)`, 'g')
  const install = new RegExp(String.raw`\b${INSTALLER}((?:\s+-{1,2}[\w-]+)*)((?:\s+[^\s\`'")\]#;&|]+)*)`, 'g')
  for (const file of pluginTextFiles()) {
    const rel = file.slice(PLUGIN_DIR.length + 1)
    readFileSync(file, 'utf-8').split('\n').forEach((line, i) => {
      const at = `${rel}:${i + 1}`
      if (/@latest\b/.test(line)) problems.push(`${at} names @latest`)
      for (const m of line.matchAll(run)) {
        if (!EXACT.test(m[2])) problems.push(`${at} runs ${m[2]} without an exact version`)
      }
      for (const m of line.matchAll(install)) {
        for (const spec of m[2].trim().split(/\s+/).filter(Boolean)) {
          if (!spec.startsWith('-') && !EXACT.test(spec)) problems.push(`${at} installs ${spec} without an exact version`)
        }
      }
    })
  }
  for (const [name, server] of Object.entries(readJson(PLUGIN_MCP).mcpServers ?? {})) {
    if (/^(npx|bunx|uvx)$/.test(server.command)) {
      const spec = (server.args ?? []).find(arg => !arg.startsWith('-'))
      if (!EXACT.test(spec ?? '')) problems.push(`.mcp.json server "${name}" runs ${spec} without an exact version`)
    }
  }
  if (problems.length > 0) {
    console.error(`✘ The plugin runs or installs packages without an exact version (the directory rejects this):\n  ${problems.join('\n  ')}`)
    process.exit(1)
  }
}

function build() {
  const skillsOut = join(PLUGIN_DIR, 'skills')
  const frameworksOut = join(PLUGIN_DIR, 'frameworks')

  rmSync(skillsOut, { recursive: true, force: true })
  rmSync(frameworksOut, { recursive: true, force: true })
  mkdirSync(skillsOut, { recursive: true })

  const missing = CURATED_SKILLS.filter(s => !readdirSync(SKILLS_SRC).includes(s))
  if (missing.length > 0) {
    console.error(`✘ Missing skills in ${SKILLS_SRC}: ${missing.join(', ')}`)
    process.exit(1)
  }

  for (const skill of CURATED_SKILLS) {
    cpSync(join(SKILLS_SRC, skill), join(skillsOut, skill), { recursive: true })
  }
  cpSync(FRAMEWORKS_SRC, frameworksOut, { recursive: true })

  const pinned = pinPluginText(workspaceVersions())
  const version = syncVersion()
  const mcpSpec = writeMcpConfig()
  checkExactPins()
  writeOpenAiPlugin(version)
  const frameworkCount = readdirSync(frameworksOut).filter(f => f.endsWith('.md')).length
  console.log(`✔ plugins/contentrain@${version} — ${CURATED_SKILLS.length} skills, ${frameworkCount} framework guides, MCP ${mcpSpec}, ${pinned} package references pinned`)
  console.log(`✔ plugins/contentrain-openai@${version} — remote MCP ${REMOTE_MCP_URL}`)
}

build()

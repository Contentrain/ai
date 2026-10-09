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
const MARKETPLACE_MANIFEST = join(ROOT, '.claude-plugin/marketplace.json')
const PLUGIN_MCP = join(PLUGIN_DIR, '.mcp.json')
const MCP_PKG = join(ROOT, 'packages/mcp/package.json')

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
 * puts that bump in the release flow instead of a human's memory.
 */
function syncVersion() {
  const { version } = readJson(PLUGIN_PKG)
  if (typeof version !== 'string' || version.length === 0) {
    console.error(`✘ No version in ${PLUGIN_PKG}`)
    process.exit(1)
  }

  const manifest = readJson(PLUGIN_MANIFEST)
  manifest.version = version
  writeJson(PLUGIN_MANIFEST, manifest)

  const marketplace = readJson(MARKETPLACE_MANIFEST)
  marketplace.metadata = { ...marketplace.metadata, version }
  writeJson(MARKETPLACE_MANIFEST, marketplace)

  return version
}

/**
 * plugins/contentrain/.mcp.json pins the MCP server the plugin starts. It is
 * written from packages/mcp/package.json as `^<major>`: a hand-kept exact pin
 * sat at 2.3.0 (24 tools) for ~70 releases while the plugin's skill described
 * 27. A caret on the current major takes every fix without a plugin release,
 * and a new major regenerates this file, which CI's stale-diff check catches.
 */
function writeMcpConfig() {
  const { version } = readJson(MCP_PKG)
  const major = /^(\d+)\./.exec(version ?? '')?.[1]
  if (!major) {
    console.error(`✘ Cannot read a major version from ${MCP_PKG} (got ${JSON.stringify(version)})`)
    process.exit(1)
  }
  const spec = `@contentrain/mcp@^${major}`
  writeJson(PLUGIN_MCP, { mcpServers: { contentrain: { command: 'npx', args: ['-y', spec] } } })
  return spec
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

  const version = syncVersion()
  const mcpSpec = writeMcpConfig()
  const frameworkCount = readdirSync(frameworksOut).filter(f => f.endsWith('.md')).length
  console.log(`✔ plugins/contentrain@${version} — ${CURATED_SKILLS.length} skills, ${frameworkCount} framework guides, MCP ${mcpSpec}`)
}

build()

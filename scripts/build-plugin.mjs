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
import { cpSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SKILLS_SRC = join(ROOT, 'packages/skills/skills')
const FRAMEWORKS_SRC = join(ROOT, 'packages/skills/frameworks')
const PLUGIN_DIR = join(ROOT, 'plugins/contentrain')

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

  const frameworkCount = readdirSync(frameworksOut).filter(f => f.endsWith('.md')).length
  console.log(`✔ plugins/contentrain — ${CURATED_SKILLS.length} skills, ${frameworkCount} framework guides`)
}

build()

#!/usr/bin/env node
import { defineCommand, runMain } from 'citty'
import packageJson from '../package.json' with { type: 'json' }
import { enableDebug } from './utils/debug.js'

// Global --debug opt-in — parse before citty takes over so every
// subcommand's debug() / debugTimer() calls see the flag. Env var
// `CONTENTRAIN_DEBUG=1` also flips this on (handled inside the
// helper). Stripped from argv so citty doesn't complain about an
// unknown root flag.
const debugIndex = process.argv.findIndex(a => a === '--debug')
if (debugIndex !== -1) {
  enableDebug()
  process.argv.splice(debugIndex, 1)
}

const main = defineCommand({
  meta: {
    name: 'contentrain',
    version: packageJson.version,
    description: 'Contentrain CLI — AI content governance infrastructure',
  },
  subCommands: {
    init: () => import('./commands/init.js').then(m => m.default),
    status: () => import('./commands/status.js').then(m => m.default),
    doctor: () => import('./commands/doctor.js').then(m => m.default),
    validate: () => import('./commands/validate.js').then(m => m.default),
    serve: () => import('./commands/serve.js').then(m => m.default),
    generate: () => import('./commands/generate.js').then(m => m.default),
    diff: () => import('./commands/diff.js').then(m => m.default),
    merge: () => import('./commands/merge.js').then(m => m.default),
    describe: () => import('./commands/describe.js').then(m => m.default),
    'describe-format': () => import('./commands/describe-format.js').then(m => m.default),
    scaffold: () => import('./commands/scaffold.js').then(m => m.default),
    setup: () => import('./commands/setup.js').then(m => m.default),
    skills: () => import('./commands/skills.js').then(m => m.default),
    studio: () => import('./studio/index.js').then(m => m.default),
  },
})

runMain(main)

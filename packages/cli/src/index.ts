#!/usr/bin/env node
import { defineCommand, runMain } from 'citty'
import packageJson from '../package.json' with { type: 'json' }

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
    setup: () => import('./commands/setup.js').then(m => m.default),
    skills: () => import('./commands/skills.js').then(m => m.default),
    studio: () => import('./studio/index.js').then(m => m.default),
  },
})

runMain(main)

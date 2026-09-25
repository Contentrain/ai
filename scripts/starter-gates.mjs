#!/usr/bin/env node
// Runs templates/astro-starter's gates the way a delivered site runs them:
// copied out of the monorepo into a directory of its own, installed from its
// own package.json, then `astro check`, `knip`, `astro build` + Pagefind and
// `scripts/check-dist.mjs`.
//
//   node scripts/starter-gates.mjs                      the empty starter
//   node scripts/starter-gates.mjs --fixture wp-demo    with templates/fixtures/wp-demo laid over it
//   node scripts/starter-gates.mjs --local-sdk          @contentrain/query from this checkout, not npm
//   node scripts/starter-gates.mjs --out <dir>          keep the project there (default: a temp dir, removed on success)
//
// --local-sdk tests the starter against the SDK at HEAD, so an SDK change
// that would break delivered sites fails here before it is released.

import { execFileSync } from 'node:child_process'
import { cpSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const { values } = parseArgs({
  options: {
    fixture: { type: 'string' },
    'local-sdk': { type: 'boolean', default: false },
    out: { type: 'string' },
  },
})

const starter = join(root, 'templates', 'astro-starter')
const project = values.out ? resolve(values.out) : mkdtempSync(join(tmpdir(), 'astro-starter-'))
const run = (command, args, cwd = project) => {
  console.log(`\n$ ${command} ${args.join(' ')}`)
  execFileSync(command, args, { cwd, stdio: 'inherit', env: { ...process.env, CI: 'true' } })
}

rmSync(project, { recursive: true, force: true })
cpSync(starter, project, {
  recursive: true,
  filter: source => !/\/(?:node_modules|dist|\.astro|\.lighthouseci)(?:\/|$)/.test(source.slice(starter.length)),
})
if (values.fixture) {
  cpSync(join(root, 'templates', 'fixtures', values.fixture), project, { recursive: true })
}

run('pnpm', ['install', '--no-frozen-lockfile'])
if (values['local-sdk']) {
  run('pnpm', ['--filter', '@contentrain/types', '--filter', '@contentrain/query', 'build'], root)
  const packDir = mkdtempSync(join(tmpdir(), 'contentrain-query-'))
  run('pnpm', ['pack', '--pack-destination', packDir], join(root, 'packages', 'sdk', 'js'))
  const tarball = readdirSync(packDir).find(name => name.endsWith('.tgz'))
  if (!tarball) throw new Error('pnpm pack produced no tarball')
  run('pnpm', ['add', join(packDir, tarball)])
}

run('pnpm', ['exec', 'astro', 'check'])
run('pnpm', ['exec', 'knip'])
run('pnpm', ['run', 'build'])
run('node', ['scripts/check-dist.mjs'])

console.log(`\nstarter gates passed${values.fixture ? ` (fixture: ${values.fixture})` : ''} — ${project}`)
if (!values.out) rmSync(project, { recursive: true, force: true })

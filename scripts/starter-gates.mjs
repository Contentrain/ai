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
//   node scripts/starter-gates.mjs --frozen             install exactly the starter's lockfile — the published
//                                                       packages a delivered site gets (no --local-sdk)
//
// --local-sdk tests the starter against the SDK at HEAD, so an SDK change
// that would break delivered sites fails here before it is released.
//
// A fixture is laid over the starter as files. Its `fixture.json` is not a
// site file: `dependencies` there are added after install, the way a
// migration adds what the kit components it copies need (embla-carousel for
// the slider).

import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const { values } = parseArgs({
  options: {
    fixture: { type: 'string' },
    'local-sdk': { type: 'boolean', default: false },
    frozen: { type: 'boolean', default: false },
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
const fixtureDir = values.fixture ? join(root, 'templates', 'fixtures', values.fixture) : undefined
if (fixtureDir) cpSync(fixtureDir, project, { recursive: true, filter: source => source !== join(fixtureDir, 'fixture.json') })
const fixtureDeps = fixtureDir && existsSync(join(fixtureDir, 'fixture.json'))
  ? Object.entries(JSON.parse(readFileSync(join(fixtureDir, 'fixture.json'), 'utf8')).dependencies ?? {})
  : []

if (values.frozen && values['local-sdk']) throw new Error('--frozen tests the published packages; --local-sdk replaces one. Pick one.')
run('pnpm', ['install', values.frozen ? '--frozen-lockfile' : '--no-frozen-lockfile'])
if (fixtureDeps.length) run('pnpm', ['add', ...fixtureDeps.map(([name, range]) => `${name}@${range}`)])
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

// Copies templates/astro-starter into the package as starter/ for npm pack
// and publish (prepack; postpack removes it). In the monorepo the writer reads
// the template in place, so a local build never uses a stale copy.
import { cpSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const pkg = join(dirname(fileURLToPath(import.meta.url)), '..')
const source = join(pkg, '..', '..', 'templates', 'astro-starter')
const target = join(pkg, 'starter')
rmSync(target, { recursive: true, force: true })
cpSync(source, target, {
  recursive: true,
  filter: path => !/\/(?:node_modules|dist|\.astro|\.lighthouseci)(?:\/|$)/.test(path.slice(source.length)),
})
console.log(`bundled ${source} → ${target}`)

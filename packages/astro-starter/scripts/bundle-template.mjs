// Copies templates/astro-starter into the package as template/ for npm pack and
// publish (prepack; postpack removes it). Build output, dependencies and caches
// stay behind: the starter is installed from its own lockfile where it lands.
// The .gitignore is packed as _gitignore, which npm keeps.
import { cpSync, renameSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const pkg = join(dirname(fileURLToPath(import.meta.url)), '..')
const source = join(pkg, '..', '..', 'templates', 'astro-starter')
const target = join(pkg, 'template')
rmSync(target, { recursive: true, force: true })
cpSync(source, target, {
  recursive: true,
  filter: path => !/\/(?:node_modules|dist|\.astro|\.lighthouseci)(?:\/|$)/.test(path.slice(source.length)),
})
// npm never packs a .gitignore; copyStarter() gives it back its name.
renameSync(join(target, '.gitignore'), join(target, '_gitignore'))
console.log(`bundled ${source} → ${target}`)

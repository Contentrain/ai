import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'
import { PRIVATE_PACKAGE_JSONS, PUBLISHABLE_PACKAGES } from './release-packages.mjs'

/**
 * Packages a pending changeset will bump before anything is published.
 *
 * `0.0.0` is the correct version for a package that has never been released:
 * changesets computes the first real version from the changeset. Rejecting it
 * outright would mean a new package could not be registered here until after
 * its first release — which is how `emitter-astro` and `wp-import` ended up on
 * npm having never passed this check at all.
 */
async function packagesWithPendingChangeset() {
  const pending = new Set()
  let files = []
  try {
    files = await readdir(resolve('.changeset'))
  } catch {
    return pending
  }
  for (const file of files) {
    if (!file.endsWith('.md') || file === 'README.md') continue
    const body = await readFile(resolve('.changeset', file), 'utf-8')
    const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(body)?.[1] ?? ''
    for (const [, name] of frontmatter.matchAll(/^\s*["']([^"']+)["']\s*:/gm)) pending.add(name)
  }
  return pending
}

const pendingBump = await packagesWithPendingChangeset()
let failed = false

for (const pkg of PUBLISHABLE_PACKAGES) {
  const packageJsonPath = resolve(pkg.packageJson)
  const readmePath = resolve(pkg.dir, 'README.md')

  const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf-8'))

  if (packageJson.private === true) {
    console.error(`publishable package is still private: ${pkg.name}`)
    failed = true
  }

  if (packageJson.publishConfig?.access !== 'public') {
    console.error(`missing publishConfig.access=public: ${pkg.name}`)
    failed = true
  }

  const unreleasedWithBump = packageJson.version === '0.0.0' && pendingBump.has(pkg.name)
  if (!packageJson.version || (packageJson.version === '0.0.0' && !unreleasedWithBump)) {
    console.error(`invalid package version for ${pkg.name}: ${packageJson.version ?? '<missing>'}`)
    failed = true
  }

  if (!packageJson.repository?.url || !packageJson.homepage || !packageJson.bugs?.url) {
    console.error(`missing publish metadata: ${pkg.name}`)
    failed = true
  }

  try {
    await readFile(readmePath, 'utf-8')
  } catch {
    console.error(`missing README: ${pkg.dir}/README.md`)
    failed = true
  }
}

for (const packageJsonFile of PRIVATE_PACKAGE_JSONS) {
  const packageJsonPath = resolve(packageJsonFile)
  const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf-8'))
  if (packageJson.private !== true) {
    console.error(`internal package must stay private: ${packageJsonFile}`)
    failed = true
  }
}

if (failed) {
  process.exit(1)
}

console.log('release check passed')

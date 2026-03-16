import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'
import { PRIVATE_PACKAGE_JSONS, PUBLISHABLE_PACKAGES } from './release-manifest.mjs'

const versions = new Map()
let failed = false

for (const pkg of PUBLISHABLE_PACKAGES) {
  const packageJsonPath = resolve(pkg.packageJson)
  const readmePath = resolve(pkg.dir, 'README.md')

  const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf-8'))
  versions.set(pkg.name, packageJson.version)

  if (packageJson.private === true) {
    console.error(`publishable package is still private: ${pkg.name}`)
    failed = true
  }

  if (packageJson.version === '0.0.0') {
    console.error(`placeholder version remains: ${pkg.name} -> 0.0.0`)
    failed = true
  }

  if (packageJson.publishConfig?.access !== 'public') {
    console.error(`missing publishConfig.access=public: ${pkg.name}`)
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

const uniqueVersions = new Set(versions.values())
if (uniqueVersions.size > 1) {
  console.error('lockstep release violated: publishable packages do not share the same version')
  for (const [name, version] of versions) {
    console.error(`  ${name}: ${version}`)
  }
  failed = true
}

if (failed) {
  process.exit(1)
}

console.log(`release check passed (${[...uniqueVersions][0]})`)

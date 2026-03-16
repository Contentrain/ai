import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'
import { PRIVATE_PACKAGE_JSONS, PUBLISHABLE_PACKAGES } from './release-packages.mjs'

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

  if (!packageJson.version || packageJson.version === '0.0.0') {
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

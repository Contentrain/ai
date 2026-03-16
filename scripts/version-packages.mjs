import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'
import { LOCKSTEP_FILES, PUBLISHABLE_PACKAGES } from './release-manifest.mjs'

const nextVersion = process.argv[2]

if (!nextVersion || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(nextVersion)) {
  console.error('Usage: node scripts/version-packages.mjs <semver>')
  process.exit(1)
}

for (const pkg of PUBLISHABLE_PACKAGES) {
  const packageJsonPath = resolve(pkg.packageJson)
  const raw = await readFile(packageJsonPath, 'utf-8')
  const json = JSON.parse(raw)
  json.version = nextVersion
  await writeFile(packageJsonPath, `${JSON.stringify(json, null, 2)}\n`, 'utf-8')
  console.log(`versioned ${pkg.name} -> ${nextVersion}`)
}

for (const file of LOCKSTEP_FILES) {
  const path = resolve(file)
  const raw = await readFile(path, 'utf-8')
  const updated = raw.replace(/version:\s*'[^']+'/u, `version: '${nextVersion}'`)
  if (updated !== raw) {
    await writeFile(path, updated, 'utf-8')
    console.log(`updated runtime version in ${file}`)
  }
}

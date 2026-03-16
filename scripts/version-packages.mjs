import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { PUBLISHABLE_PACKAGES } from './release-manifest.mjs'

for (const pkg of PUBLISHABLE_PACKAGES) {
  const packageJsonPath = resolve(pkg.packageJson)
  const raw = await readFile(packageJsonPath, 'utf-8')
  const json = JSON.parse(raw)
  json.version = pkg.version
  await writeFile(packageJsonPath, `${JSON.stringify(json, null, 2)}\n`, 'utf-8')
  console.log(`versioned ${pkg.name} -> ${pkg.version}`)

  for (const file of pkg.runtimeVersionFiles ?? []) {
    const path = resolve(file)
    const runtimeRaw = await readFile(path, 'utf-8')
    const updated = runtimeRaw.replace(/version:\s*'[^']+'/u, `version: '${pkg.version}'`)
    if (updated !== runtimeRaw) {
      await writeFile(path, updated, 'utf-8')
      console.log(`updated runtime version in ${file}`)
    }
  }
}

import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { PUBLISHABLE_PACKAGES } from './release-packages.mjs'

const outputDir = resolve('.release-packages')
await mkdir(outputDir, { recursive: true })

for (const pkg of PUBLISHABLE_PACKAGES) {
  execFileSync('pnpm', ['--dir', pkg.dir, 'pack', '--pack-destination', outputDir], {
    stdio: 'inherit',
  })
}

console.log(`packed ${PUBLISHABLE_PACKAGES.length} packages into ${outputDir}`)

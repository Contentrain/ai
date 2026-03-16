import { execFileSync } from 'node:child_process'
import process from 'node:process'
import { PUBLISHABLE_PACKAGES } from './release-manifest.mjs'

const run = (cmd, args) => execFileSync(cmd, args, { stdio: 'inherit' })

// Derive tag from the highest semver in the manifest
const versions = PUBLISHABLE_PACKAGES.map(p => p.version)
const highest = versions.toSorted((a, b) => {
  const [aMaj, aMin, aPat] = a.split('.').map(Number)
  const [bMaj, bMin, bPat] = b.split('.').map(Number)
  return bMaj - aMaj || bMin - aMin || bPat - aPat
})[0]

const tag = `v${highest}`

// Safety: ensure release:check passes
console.log('Running release:check...')
execFileSync('pnpm', ['release:check'], { stdio: 'inherit' })

// Safety: ensure working tree is clean
const status = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf-8' }).trim()
if (status) {
  console.error('Working tree is dirty. Commit or stash changes first.')
  console.error(status)
  process.exit(1)
}

// Safety: check tag doesn't already exist
const existingTags = execFileSync('git', ['tag', '-l', tag], { encoding: 'utf-8' }).trim()
if (existingTags) {
  console.error(`Tag ${tag} already exists. Bump versions in release-manifest.mjs first.`)
  process.exit(1)
}

// Print summary
console.log('')
console.log('Release summary:')
for (const pkg of PUBLISHABLE_PACKAGES) {
  console.log(`  ${pkg.name} @ ${pkg.version}`)
}
console.log(`  tag: ${tag}`)
console.log('')

// Create tag and push
run('git', ['tag', tag])
console.log(`Created tag ${tag}`)

run('git', ['push', 'origin', 'main', '--tags'])
console.log(`Pushed main + ${tag} to origin`)
console.log('')
console.log(`CI will now build, test, and publish to npm.`)
console.log(`Watch: https://github.com/Contentrain/ai/actions`)

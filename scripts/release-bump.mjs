import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import process from 'node:process'
import { PUBLISHABLE_PACKAGES } from './release-manifest.mjs'

const git = (...args) => execFileSync('git', args, { encoding: 'utf-8' }).trim()

// Find latest release tag
const tags = git('tag', '-l', 'v*', '--sort=-version:refname')
const lastTag = tags.split('\n').find(Boolean)

if (!lastTag) {
  console.error('No release tags found (v*). Create an initial tag first: git tag v0.0.1')
  process.exit(1)
}

console.log(`Last release tag: ${lastTag}`)
console.log('')

// Get commits since last tag
const log = git('log', `${lastTag}..HEAD`, '--oneline', '--no-merges')
if (!log) {
  console.log('No new commits since last release.')
  process.exit(0)
}

const commits = log.split('\n').filter(Boolean)

// Detect which packages changed (by file paths)
const changedFiles = git('diff', '--name-only', `${lastTag}..HEAD`)
  .split('\n')
  .filter(Boolean)

// Map dirs to packages
const changedPackages = new Set()
for (const file of changedFiles) {
  for (const pkg of PUBLISHABLE_PACKAGES) {
    if (file.startsWith(pkg.dir + '/')) {
      changedPackages.add(pkg.name)
    }
  }
}

if (changedPackages.size === 0) {
  console.log('No publishable packages changed since last release.')
  process.exit(0)
}

// Determine bump type from conventional commit prefixes
// feat → minor, everything else (fix, refactor, perf, docs, chore) → patch
const hasFeat = commits.some(c => /^[a-f0-9]+ feat[(!:]/.test(c))
const bumpType = hasFeat ? 'minor' : 'patch'

console.log(`Bump type: ${bumpType} (based on commit prefixes)`)
console.log(`Changed packages:`)

// Bump versions in manifest
const manifestPath = 'scripts/release-manifest.mjs'
let manifestContent = await readFile(manifestPath, 'utf-8')

for (const pkg of PUBLISHABLE_PACKAGES) {
  if (!changedPackages.has(pkg.name)) continue

  const [major, minor, patch] = pkg.version.split('.').map(Number)
  let newVersion
  if (bumpType === 'minor') {
    newVersion = `${major}.${minor + 1}.0`
  } else {
    newVersion = `${major}.${minor}.${patch + 1}`
  }

  console.log(`  ${pkg.name}: ${pkg.version} → ${newVersion}`)

  // Update manifest content
  manifestContent = manifestContent.replace(
    new RegExp(`(name: '${pkg.name.replace('/', '\\/')}',\\n[\\s\\S]*?version: )'${pkg.version.replace(/\./g, '\\.')}'`),
    `$1'${newVersion}'`,
  )
}

// Write updated manifest
await writeFile(manifestPath, manifestContent, 'utf-8')
console.log('')
console.log('Updated release-manifest.mjs')

// Run version sync
console.log('Syncing versions to package.json files...')
execFileSync('pnpm', ['release:version'], { stdio: 'inherit' })

// Build commit message
const scope = changedPackages.size === 1
  ? `(${[...changedPackages][0].replace('@contentrain/', '')})`
  : ''

const changedList = [...changedPackages]
  .map(name => {
    const pkg = PUBLISHABLE_PACKAGES.find(p => p.name === name)
    const [major, minor, patch] = pkg.version.split('.').map(Number)
    const newVersion = bumpType === 'minor'
      ? `${major}.${minor + 1}.0`
      : `${major}.${minor}.${patch + 1}`
    return `- ${name} @ ${newVersion}`
  })
  .join('\n')

const commitMsg = `release${scope}: ${bumpType} bump\n\n${changedList}`

// Stage and commit
execFileSync('git', ['add', '-A'], { stdio: 'inherit' })
execFileSync('git', ['commit', '-m', commitMsg], { stdio: 'inherit' })

console.log('')
console.log('Release commit created. Run `pnpm release` to tag and push.')

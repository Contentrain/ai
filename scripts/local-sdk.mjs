// `--local-sdk` for every script that tests a copied site against this checkout
// (scripts/starter-gates.mjs, packages/astro-kit/scripts/visual.mjs).
//
// The SDK at HEAD is released together with the types at HEAD: its
// `workspace:*` range on @contentrain/types becomes their version. So the two
// are installed together. Packing @contentrain/query alone resolved its types
// from npm, and an SDK that imports a types export npm does not have yet failed
// `astro sync` although the release would have been fine (#512).

import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * Build @contentrain/types and @contentrain/query from `repoRoot`, pack both,
 * pin the site's @contentrain/types to the local tarball with `pnpm.overrides`,
 * and add the local query tarball. `run(command, args, cwd)` runs in `site`
 * when `cwd` is omitted.
 */
export function installLocalSdk({ repoRoot, site, run }) {
  run('pnpm', ['--filter', '@contentrain/types', '--filter', '@contentrain/query', 'build'], repoRoot)
  const pack = (dir) => {
    const packDir = mkdtempSync(join(tmpdir(), 'contentrain-pack-'))
    run('pnpm', ['pack', '--pack-destination', packDir], join(repoRoot, dir))
    const tarball = readdirSync(packDir).find(name => name.endsWith('.tgz'))
    if (!tarball) throw new Error(`pnpm pack produced no tarball in ${dir}`)
    return join(packDir, tarball)
  }
  const typesTarball = pack('packages/types')
  const pkgPath = join(site, 'package.json')
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
  pkg.pnpm = { ...pkg.pnpm, overrides: { ...pkg.pnpm?.overrides, '@contentrain/types': `file:${typesTarball}` } }
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)
  run('pnpm', ['add', pack('packages/sdk/js')], site)
}

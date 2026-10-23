import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The kit visual in CI: drawn in Playwright's own image at the lockfile's version, compared with committed linux
 * baselines. An image that drifted from the lockfile would draw with other browsers than the baselines were written
 * with; a baseline written in CI would pass whatever was drawn.
 */
const ROOT = join(import.meta.dirname, '..', '..', '..')
const read = (...path: string[]) => readFile(join(ROOT, ...path), 'utf8')

describe('the kit visual in CI', () => {
  it('runs in the Playwright image of the version the lockfile installs', async () => {
    const lock = await read('pnpm-lock.yaml')
    // One version, named under packages and again under snapshots.
    const installed = [...new Set([...lock.matchAll(/^ {2}playwright@(\d+\.\d+\.\d+):/gm)].map(match => match[1]))]
    expect(installed).toHaveLength(1)
    const workflow = await read('.github/workflows/kit-visual.yml')
    expect(workflow).toContain(`image: mcr.microsoft.com/playwright:v${installed[0]}-noble`)
  })

  it('reads the repository only, reports on every pull request, and draws only where a drawing can change', async () => {
    const workflow = await read('.github/workflows/kit-visual.yml')
    expect(workflow).toMatch(/permissions:\s*\n\s*contents: read/)
    expect(workflow).not.toMatch(/contents: write|git push/)
    // No workflow-level paths filter: a required check that never reports would block every other pull request.
    expect(workflow).not.toMatch(/^\s+paths:/m)
    expect(workflow).toContain("if: needs.changes.outputs.kit == 'true'")
    // Both paths of a rename: with rename detection on, a file moved out of the kit would list only its new path.
    expect(workflow).toContain('git diff --no-renames --name-only "$BASE" HEAD')
    const watched = /grep -qE '([^']+)'/.exec(workflow)![1]!
    for (const path of ['packages/astro-kit/', 'templates/astro-starter/', 'packages/types/', 'packages/query/', 'scripts/local-sdk\\.mjs$', 'pnpm-lock\\.yaml$', '\\.github/workflows/kit-visual\\.yml$']) expect(watched).toContain(path)
    // The verify job no longer draws the kit: it would do so outside the pinned image.
    expect(await read('.github/workflows/ci.yml')).not.toContain('visual.mjs')
  })

  it('compares with --ci on every run but a hand-run that rewrites the baselines', async () => {
    const workflow = await read('.github/workflows/kit-visual.yml')
    expect(workflow).toContain("visual.mjs --local-sdk ${{ inputs.update && '--update' || '--ci' }}")
  })

  it('fails on a missing baseline with --ci, keeping the shot, instead of writing one', async () => {
    const visual = await read('packages/astro-kit/scripts/visual.mjs')
    expect(visual).toContain('ci: { type: \'boolean\', default: false }')
    expect(visual).toContain('if (values.ci && !values.update && !existsSync(file)) {')
    expect(visual).toContain("writeFileSync(file.replace(/\\.png$/, '.actual.png'), PNG.sync.write(shot))")
  })
})

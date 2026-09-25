// Copying components into a site — the shadcn model: the site owns the
// source, there is no runtime dependency on this package. A component is
// copied with every kit component it renders and every shared file it
// imports, under `src/components/kit/`, keeping the relative layout its
// imports expect.

import { copyFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { KitCatalog } from './catalog.js'

/** Where kit files land in a site, relative to the site root. */
export const KIT_DIR = 'src/components/kit'

export interface CopyPlan {
  /** Components copied, the requested ones and everything they render, sorted. */
  components: string[]
  /** Site-relative destination → path relative to the kit's `components/` directory. */
  files: Record<string, string>
  /** npm packages the site needs, name → range. */
  dependencies: Record<string, string>
}

export function planCopy(catalog: KitCatalog, ids: readonly string[]): CopyPlan {
  const byId = new Map(catalog.components.map(c => [c.id, c]))
  const wanted = new Set<string>()
  const visit = (id: string) => {
    if (wanted.has(id)) return
    const component = byId.get(id)
    if (!component) throw new Error(`astro-kit has no component "${id}". Known: ${[...byId.keys()].join(', ')}.`)
    wanted.add(id)
    for (const used of component.uses) visit(used)
  }
  for (const id of ids) visit(id)

  const files: Record<string, string> = {}
  const dependencies: Record<string, string> = { ...catalog.dependencies }
  for (const id of [...wanted].toSorted()) {
    const component = byId.get(id)!
    for (const file of component.files) files[`${KIT_DIR}/${id}/${file}`] = `${id}/${file}`
    for (const file of component.shared) files[`${KIT_DIR}/_shared/${file}`] = `_shared/${file}`
    Object.assign(dependencies, component.dependencies)
  }
  return { components: [...wanted].toSorted(), files, dependencies }
}

/** Carry out a plan: `kitRoot` is the kit's `components/` directory, `siteRoot` the site. */
export async function copyComponents(plan: CopyPlan, kitRoot: string, siteRoot: string): Promise<void> {
  await Promise.all(Object.entries(plan.files).map(async ([dest, source]) => {
    const target = join(siteRoot, dest)
    await mkdir(dirname(target), { recursive: true })
    await copyFile(join(kitRoot, source), target)
  }))
}

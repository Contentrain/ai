// The deterministic half of the writer: starter + imported store + plan →
// a project that builds. No model call happens here. What this cannot
// express — site components, placements the view generator refuses — is
// listed in the report for the agent, which then works inside the same tree.

import { existsSync } from 'node:fs'
import { cp, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, relative, sep } from 'node:path'
import { copyComponents, planCopy, type KitCatalog } from '@contentrain/astro-kit'
import { canonicalStringify, type ModelDefinition, type ProjectPlan } from '@contentrain/types'
import { configWithDomains, mergeStarterModels, planModelFiles } from './models.js'
import { contentConfigSource } from './schema.js'
import { astroConfigSource, fontRoles, presetsSource, redirectsSource, siteConfigSource, themeSource, withPresetsImport, withSiteFonts, withSiteFontTags } from './site.js'
import { composedIndexSource, composedViews, type RoutePlanOutcome } from './views.js'

export interface GenerateInput {
  plan: ProjectPlan
  catalog: KitCatalog
  /** The kit's `components/` directory. */
  kitRoot: string
  /** templates/astro-starter. */
  starterDir: string
  /**
   * A directory holding wp-import's `.contentrain` (models, content, meta, config), copied into `outDir`.
   * Absent, `outDir` already holds it (the worker's project directory) and it is left in place.
   */
  importDir?: string
  outDir: string
  /** The source's document title pattern (`{title} - {site}`), from the fact pack's SEO. */
  titleTemplate?: string
  /** Decisions under this confidence count as low (site component instead of a kit guess). Default 0.8. */
  confidenceFloor?: number
}

export interface GenerateReport {
  outDir: string
  /** Starter fields and models added to the imported ones, by model. */
  modelsExtended: Record<string, string[]>
  /** Starter content copied for models the import did not have (interface strings, empty menus). */
  seeded: string[]
  /** Files the generator wrote or rewrote, site-relative, sorted. */
  written: string[]
  kit: { components: string[], dependencies: Record<string, string> }
  routes: Omit<RoutePlanOutcome, 'views'> & { views: Array<{ route: string, file: string, wpIds: number[] }> }
  /** Components the plan leaves to the site writer, with their briefs. */
  siteComponents: Array<{ id: string, covers: string[], template?: string }>
  /** Decisions below the confidence floor or taken by fallback — each a site component, not a kit guess. */
  lowConfidence: Array<{ id: string, answer: string, by: string, confidence?: number }>
}

const SKIP = /(?:^|\/)(?:node_modules|dist|\.astro|\.lighthouseci)(?:\/|$)/

export async function readModels(dir: string): Promise<ModelDefinition[]> {
  const names = (await readdir(dir)).filter(name => name.endsWith('.json')).toSorted()
  return Promise.all(names.map(async name => JSON.parse(await readFile(join(dir, name), 'utf8')) as ModelDefinition))
}

const slug = (value: string) => value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64)

/** npm package name for the site: its title, else its host, as a valid lowercase name. */
export function packageName(plan: ProjectPlan): string {
  let host = ''
  try { host = new URL(plan.site.url).hostname.replace(/^www\./, '') } catch {}
  return slug(plan.site.title) || slug(host) || 'site'
}

export async function generateProject(input: GenerateInput): Promise<GenerateReport> {
  const { plan, catalog, outDir } = input
  const written = new Set<string>()
  const write = async (path: string, text: string) => {
    const target = join(outDir, path)
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, text)
    written.add(path)
  }
  const read = (path: string) => readFile(join(outDir, path), 'utf8')

  // 1. The starter's code around the imported store. The starter's own `.contentrain` is sample data;
  //    only its models (merged below) and the content of models the import lacks (interface strings,
  //    empty menus) are taken from it.
  const starterStore = join(input.starterDir, '.contentrain')
  const inStarter = (source: string) => relative(input.starterDir, source)
  const under = (rel: string, dir: string) => rel === dir || rel.startsWith(`${dir}${sep}`)
  await cp(input.starterDir, outDir, {
    recursive: true,
    filter: (source) => {
      const rel = inStarter(source)
      return !SKIP.test(rel) && !under(rel, '.contentrain') && !under(rel, 'public')
    },
  })
  // public/ holds what earlier stages put there (media, the site's favicon): a starter file never replaces one.
  await cp(join(input.starterDir, 'public'), join(outDir, 'public'), { recursive: true, force: false, errorOnExist: false })
  if (input.importDir) await cp(join(input.importDir, '.contentrain'), join(outDir, '.contentrain'), { recursive: true, force: true })
  const starterModels = await readModels(join(starterStore, 'models'))
  const importedModels = await readModels(join(outDir, '.contentrain/models'))
  const merged = mergeStarterModels(starterModels, importedModels)
  for (const model of merged.models) {
    if (merged.added[model.id]) await write(`.contentrain/models/${model.id}.json`, canonicalStringify(model))
  }
  // A whole model the import did not write starts with the starter's entries (ui-strings defaults), never over imported ones.
  const seeded: string[] = []
  for (const [id, fields] of Object.entries(merged.added)) {
    if (fields[0] !== '(model)') continue
    const model = starterModels.find(m => m.id === id)!
    for (const dir of [`content/${model.domain}/${id}`, `meta/${id}`]) {
      if (!existsSync(join(starterStore, dir)) || existsSync(join(outDir, '.contentrain', dir))) continue
      await cp(join(starterStore, dir), join(outDir, '.contentrain', dir), { recursive: true })
      seeded.push(`.contentrain/${dir}`)
    }
  }
  if (!existsSync(join(outDir, '.contentrain/config.json'))) await cp(join(starterStore, 'config.json'), join(outDir, '.contentrain/config.json'))

  // 2. Plan models and their domains; then the content config over every model.
  for (const [path, text] of Object.entries(planModelFiles(plan))) await write(path, text)
  const config = JSON.parse(await read('.contentrain/config.json')) as Record<string, unknown>
  await write('.contentrain/config.json', configWithDomains(config, plan))
  const models = await readModels(join(outDir, '.contentrain/models'))
  await write('src/content.config.ts', contentConfigSource(models))

  // 3. Site settings: addresses, redirects, the design tokens and the source theme's presets.
  await write('src/site.config.ts', siteConfigSource(await read('src/site.config.ts'), plan.site, input.titleTemplate))
  const fonts = plan.site.tokens.fonts ?? []
  await write('astro.config.mjs', withSiteFonts(astroConfigSource(await read('astro.config.mjs'), plan.site, []), fonts))
  if (fonts.length) await write('src/layouts/BaseLayout.astro', withSiteFontTags(await read('src/layouts/BaseLayout.astro'), fonts))
  await write('redirects.json', redirectsSource(plan.site))
  let globalCss = themeSource(await read('src/styles/global.css'), fontRoles(plan.site.tokens))
  const presets = presetsSource(plan.site.tokens)
  if (presets) {
    await write('src/styles/wp-presets.css', presets)
    globalCss = withPresetsImport(globalCss)
  }
  await write('src/styles/global.css', globalCss)

  // 4. Kit components the plan places, with what they render and need.
  const kitIds = [...new Set(plan.components.filter(c => c.origin === 'kit').map(c => c.kit!.id))]
  const copy = planCopy(catalog, kitIds)
  await copyComponents(copy, input.kitRoot, outDir)
  for (const path of Object.keys(copy.files)) written.add(path)
  // The project is the site's: its package is named after it, with what the copied components need.
  const pkg = JSON.parse(await read('package.json')) as { name?: string, dependencies?: Record<string, string> }
  const missing = Object.entries(copy.dependencies).filter(([name]) => !pkg.dependencies?.[name])
  pkg.name = packageName(plan)
  if (missing.length) pkg.dependencies = Object.fromEntries(Object.entries({ ...pkg.dependencies, ...Object.fromEntries(missing) }).toSorted(([a], [b]) => a.localeCompare(b)))
  await write('package.json', `${JSON.stringify(pkg, null, 2)}\n`)

  // 5. Composed pages.
  const routes = composedViews(plan, catalog, models)
  for (const view of routes.views) await write(view.file, view.source)
  await write('src/views/composed/index.ts', composedIndexSource(routes.views))

  const floor = input.confidenceFloor ?? 0.8
  return {
    outDir,
    modelsExtended: merged.added,
    seeded,
    written: [...written].toSorted(),
    kit: { components: copy.components, dependencies: Object.fromEntries(missing) },
    routes: { covered: routes.covered, unsupported: routes.unsupported, views: routes.views.map(v => ({ route: v.route, file: v.file, wpIds: v.wpIds })) },
    siteComponents: plan.components.filter(c => c.origin === 'site').map((c) => {
      const entry: GenerateReport['siteComponents'][number] = { id: c.id, covers: c.covers ?? [] }
      if (c.brief?.template) entry.template = c.brief.template
      return entry
    }),
    lowConfidence: (plan.decisions ?? [])
      // Only element placement is a kit-or-site choice; field typing has its own fallbacks.
      .filter(d => d.id.startsWith('unmapped_element:') && (d.by === 'fallback' || d.answer === 'site-specific' || (d.confidence !== undefined && d.confidence < floor)))
      .map((d) => {
        const entry: GenerateReport['lowConfidence'][number] = { id: d.id, answer: d.answer, by: d.by }
        if (d.confidence !== undefined) entry.confidence = d.confidence
        return entry
      }),
  }
}

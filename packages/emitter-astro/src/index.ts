// @contentrain/emitter-astro — the open half of the migration pipeline.
//
// A ProjectIR (route model, layout families, component variants, query
// bindings, design tokens) plus prepared content goes in; a complete Astro
// project comes out as a pure file map. The analysis that *produces* a good
// ProjectIR is hard and lives elsewhere; rendering one is deliberately
// boring — which is exactly why it can be open, portable, and replaceable
// by community emitters for other frameworks.

import type { EmitInput, EmitResult } from './types.js'
import { scaffoldFiles } from './scaffold.js'
import { familyFiles } from './layouts.js'
import { routeFiles } from './pages.js'
import { componentFiles } from './components.js'
import { wrapLegacyCss } from './css.js'

export function emitAstroProject(input: EmitInput): EmitResult {
  const { ir } = input
  const warnings: string[] = []
  const files: Record<string, string> = {}
  const add = (batch: Record<string, string>) => {
    for (const [path, content] of Object.entries(batch)) {
      if (files[path] !== undefined && files[path] !== content) {
        warnings.push(`duplicate file with different content: ${path} — keeping the first`)
        continue
      }
      files[path] = content
    }
  }

  add(scaffoldFiles(ir, input.options ?? {}))

  const familiesById = new Map(ir.families.map((f) => [f.id, f]))
  const lang = ir.site.locales?.[0] ?? 'en'
  for (const family of ir.families) {
    const fam = familyFiles(family, lang)
    add(fam.files)
    warnings.push(...fam.warnings)
  }

  for (const css of input.css ?? []) {
    const wrapped = wrapLegacyCss(css.path, css.content)
    if (wrapped.warning) warnings.push(wrapped.warning)
    const base = css.path.split('/').pop() ?? css.path
    add({ [`public/styles/legacy/${base}`]: wrapped.content })
  }
  const providedCss = new Set((input.css ?? []).map((c) => c.path.split('/').pop() ?? c.path))
  const missingCss = (refs: string[] | undefined, owner: string) => {
    for (const ref of refs ?? []) {
      if (!providedCss.has(ref.split('/').pop() ?? ref)) {
        warnings.push(`${owner}: css file "${ref}" not provided in input.css`)
      }
    }
  }
  for (const family of ir.families) missingCss(family.css.files, `family ${family.id}`)
  const allPosts = [
    ...(input.content?.posts ?? []),
    ...Object.values(input.content?.collections ?? {}).flat(),
  ]
  for (const post of allPosts) missingCss(post.css, `post ${post.slug}`)
  for (const [queryId, queryPages] of Object.entries(input.content?.queries ?? {})) {
    for (const qp of queryPages) missingCss(qp.css, `query ${queryId}`)
  }

  for (const route of ir.routes) {
    const result = routeFiles(route, familiesById.get(route.family), input.content ?? {})
    add(result.files)
    warnings.push(...result.warnings)
  }

  add(componentFiles(ir.components ?? []))

  return { files, warnings }
}

/** Write an EmitResult to disk. Separate from emit so the core stays pure. */
export async function writeEmit(result: EmitResult, dir: string): Promise<void> {
  const { mkdir, writeFile } = await import('node:fs/promises')
  const { dirname, join } = await import('node:path')
  const dirs = new Set(Object.keys(result.files).map((p) => dirname(join(dir, p))))
  await Promise.all([...dirs].map((d) => mkdir(d, { recursive: true })))
  await Promise.all(
    Object.entries(result.files).map(([path, content]) => writeFile(join(dir, path), content, 'utf8')),
  )
}

export type {
  EmitInput,
  EmitResult,
  EmitContent,
  EmitPost,
  QueryPage,
  EmitCssFile,
  EmitOptions,
} from './types.js'
export { wrapLegacyCss } from './css.js'
export { pascalCase, patternToPagePath, stableJson } from './util.js'

import type { StackType } from '@contentrain/types'
import { join } from 'node:path'
import { readJson } from './fs.js'

interface PackageJson {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

export async function detectStack(projectRoot: string): Promise<StackType> {
  const pkg = await readJson<PackageJson>(join(projectRoot, 'package.json'))
  if (!pkg) return 'other'

  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies }

  if ('nuxt' in allDeps) return 'nuxt'
  if ('next' in allDeps) return 'next'
  if ('astro' in allDeps) return 'astro'
  if ('svelte' in allDeps || '@sveltejs/kit' in allDeps) return 'svelte'
  if ('react' in allDeps && 'vite' in allDeps) return 'react-vite'

  return 'other'
}

import type { StackType } from '@contentrain/types'
import { join, dirname } from 'node:path'
import { readJson } from './fs.js'

interface PackageJson {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  workspaces?: string[] | { packages: string[] }
}

export async function detectStack(projectRoot: string): Promise<StackType> {
  // Try current directory first
  const localStack = await detectFromPackageJson(projectRoot)
  if (localStack !== 'other') return localStack

  // Walk up to find monorepo root (max 5 levels)
  let dir = dirname(projectRoot)
  for (let i = 0; i < 5; i++) {
    const pkg = await readJson<PackageJson>(join(dir, 'package.json'))
    if (pkg?.workspaces) {
      // Found monorepo root — check its dependencies
      const rootStack = await detectFromPackageJson(dir)
      if (rootStack !== 'other') return rootStack
    }
    const parent = dirname(dir)
    if (parent === dir) break // reached filesystem root
    dir = parent
  }

  return 'other'
}

async function detectFromPackageJson(dir: string): Promise<StackType> {
  const pkg = await readJson<PackageJson>(join(dir, 'package.json'))
  if (!pkg) return 'other'

  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies }

  if ('nuxt' in allDeps) return 'nuxt'
  if ('next' in allDeps) return 'next'
  if ('astro' in allDeps) return 'astro'
  if ('svelte' in allDeps || '@sveltejs/kit' in allDeps) return 'svelte'
  if ('react' in allDeps && 'vite' in allDeps) return 'react-vite'

  return 'other'
}

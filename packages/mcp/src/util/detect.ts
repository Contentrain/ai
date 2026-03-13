import type { StackType } from '@contentrain/types'
import { join, dirname } from 'node:path'
import { readJson, pathExists } from './fs.js'

interface PackageJson {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  workspaces?: string[] | { packages: string[] }
}

export interface StackInfo {
  stack: StackType
  name: string
  description: string
  monorepo: boolean
  monorepoTool?: string
  features: string[]
}

const STACK_META: Record<StackType, { name: string; description: string }> = {
  'nuxt': { name: 'Nuxt', description: 'Vue meta-framework with SSR/SSG' },
  'next': { name: 'Next.js', description: 'React framework with SSR/SSG' },
  'astro': { name: 'Astro', description: 'Content-first web framework' },
  'svelte': { name: 'SvelteKit', description: 'Svelte meta-framework' },
  'react-vite': { name: 'React + Vite', description: 'React SPA with Vite' },
  'react-native': { name: 'React Native', description: 'Cross-platform mobile framework' },
  'expo': { name: 'Expo', description: 'React Native toolchain' },
  'node': { name: 'Node.js', description: 'Server-side JavaScript runtime' },
  'other': { name: 'Other', description: 'Unknown or unsupported framework' },
}

/** Backward-compatible: returns just the StackType string */
export async function detectStack(projectRoot: string): Promise<StackType> {
  const info = await detectStackInfo(projectRoot)
  return info.stack
}

/** Rich detection: stack + monorepo + features */
export async function detectStackInfo(projectRoot: string): Promise<StackInfo> {
  // Detect stack from local package.json
  let stack = await detectFromDeps(projectRoot)

  // Walk up for monorepo root if local didn't match
  if (stack === 'other') {
    let dir = dirname(projectRoot)
    for (let i = 0; i < 5; i++) {
      const pkg = await readJson<PackageJson>(join(dir, 'package.json'))
      if (pkg?.workspaces) {
        const rootStack = await detectFromDeps(dir)
        if (rootStack !== 'other') {
          stack = rootStack
          break
        }
      }
      const parent = dirname(dir)
      if (parent === dir) break
      dir = parent
    }
  }

  const mono = await detectMonorepo(projectRoot)
  const features = await detectFeatures(projectRoot)
  const meta = STACK_META[stack]

  return {
    stack,
    name: meta.name,
    description: meta.description,
    monorepo: mono.isMonorepo,
    monorepoTool: mono.tool,
    features,
  }
}

async function detectFromDeps(dir: string): Promise<StackType> {
  const pkg = await readJson<PackageJson>(join(dir, 'package.json'))
  if (!pkg) return 'other'

  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies }

  if ('nuxt' in allDeps) return 'nuxt'
  if ('next' in allDeps) return 'next'
  if ('astro' in allDeps) return 'astro'
  if ('svelte' in allDeps || '@sveltejs/kit' in allDeps) return 'svelte'
  if ('expo' in allDeps) return 'expo'
  if ('react-native' in allDeps) return 'react-native'
  if ('react' in allDeps && 'vite' in allDeps) return 'react-vite'
  if ('express' in allDeps || 'fastify' in allDeps || 'hono' in allDeps || '@nestjs/core' in allDeps || 'koa' in allDeps) return 'node'

  return 'other'
}

async function detectMonorepo(projectRoot: string): Promise<{ isMonorepo: boolean; tool?: string }> {
  // Check current dir first
  if (await pathExists(join(projectRoot, 'pnpm-workspace.yaml'))) return { isMonorepo: true, tool: 'pnpm workspaces' }
  if (await pathExists(join(projectRoot, 'lerna.json'))) return { isMonorepo: true, tool: 'Lerna' }
  if (await pathExists(join(projectRoot, 'nx.json'))) return { isMonorepo: true, tool: 'Nx' }
  if (await pathExists(join(projectRoot, 'turbo.json'))) return { isMonorepo: true, tool: 'Turborepo' }

  const pkg = await readJson<PackageJson>(join(projectRoot, 'package.json'))
  if (pkg?.workspaces) return { isMonorepo: true, tool: 'npm/yarn workspaces' }

  // Walk up to find monorepo root
  let dir = dirname(projectRoot)
  for (let i = 0; i < 5; i++) {
    if (await pathExists(join(dir, 'pnpm-workspace.yaml'))) return { isMonorepo: true, tool: 'pnpm workspaces' }
    if (await pathExists(join(dir, 'lerna.json'))) return { isMonorepo: true, tool: 'Lerna' }
    if (await pathExists(join(dir, 'nx.json'))) return { isMonorepo: true, tool: 'Nx' }
    if (await pathExists(join(dir, 'turbo.json'))) return { isMonorepo: true, tool: 'Turborepo' }

    const parentPkg = await readJson<PackageJson>(join(dir, 'package.json'))
    if (parentPkg?.workspaces) return { isMonorepo: true, tool: 'npm/yarn workspaces' }

    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }

  return { isMonorepo: false }
}

async function detectFeatures(projectRoot: string): Promise<string[]> {
  const features: string[] = []

  // Check local + walk up for root package.json
  const allDeps = await collectAllDeps(projectRoot)

  // TypeScript
  if ('typescript' in allDeps || await pathExists(join(projectRoot, 'tsconfig.json'))) {
    features.push('TypeScript')
  }

  // i18n
  const i18nLibs = ['vue-i18n', '@nuxtjs/i18n', 'next-intl', 'react-intl', 'i18next', 'react-i18next']
  for (const lib of i18nLibs) {
    if (lib in allDeps) {
      features.push(`i18n (${lib})`)
      break
    }
  }

  // Styling
  if ('tailwindcss' in allDeps) features.push('Tailwind CSS')
  else if ('sass' in allDeps || 'scss' in allDeps) features.push('Sass/SCSS')

  // Testing
  if ('vitest' in allDeps) features.push('Vitest')
  else if ('jest' in allDeps) features.push('Jest')

  // State management
  if ('pinia' in allDeps) features.push('Pinia')
  else if ('vuex' in allDeps) features.push('Vuex')
  else if ('zustand' in allDeps) features.push('Zustand')
  else if ('@reduxjs/toolkit' in allDeps || 'redux' in allDeps) features.push('Redux')

  // CMS
  if ('@contentful/rich-text-types' in allDeps || 'contentful' in allDeps) features.push('Contentful')
  if ('@sanity/client' in allDeps) features.push('Sanity')
  if ('@strapi/strapi' in allDeps || '@strapi/sdk-js' in allDeps) features.push('Strapi')

  return features
}

async function collectAllDeps(projectRoot: string): Promise<Record<string, string>> {
  const pkg = await readJson<PackageJson>(join(projectRoot, 'package.json'))
  const allDeps: Record<string, string> = { ...pkg?.dependencies, ...pkg?.devDependencies }

  // Also check monorepo root
  let dir = dirname(projectRoot)
  for (let i = 0; i < 5; i++) {
    const parentPkg = await readJson<PackageJson>(join(dir, 'package.json'))
    if (parentPkg?.workspaces) {
      Object.assign(allDeps, parentPkg.dependencies, parentPkg.devDependencies)
      break
    }
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }

  return allDeps
}

import type { StackType, Platform } from '@contentrain/types'
import { join, dirname } from 'node:path'
import { readJson, pathExists } from './fs.js'

interface PackageJson {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  workspaces?: string[] | { packages: string[] }
}

export interface StackInfo {
  stack: StackType
  platform: Platform
  name: string
  description: string
  monorepo: boolean
  monorepoTool?: string
  features: string[]
}

const STACK_META: Record<StackType, { name: string; description: string }> = {
  // Meta-frameworks
  nuxt: { name: 'Nuxt', description: 'Vue meta-framework with SSR/SSG' },
  next: { name: 'Next.js', description: 'React framework with SSR/SSG' },
  astro: { name: 'Astro', description: 'Content-first web framework' },
  sveltekit: { name: 'SvelteKit', description: 'Svelte meta-framework' },
  remix: { name: 'Remix', description: 'Full-stack React framework' },
  analog: { name: 'Analog', description: 'Angular meta-framework' },
  // Plain frameworks
  vue: { name: 'Vue', description: 'Progressive JavaScript framework' },
  react: { name: 'React', description: 'UI library for web and native' },
  svelte: { name: 'Svelte', description: 'Compile-time UI framework' },
  solid: { name: 'Solid', description: 'Reactive UI library' },
  angular: { name: 'Angular', description: 'Platform for web applications' },
  // Mobile
  'react-native': { name: 'React Native', description: 'Cross-platform mobile framework' },
  expo: { name: 'Expo', description: 'React Native toolchain' },
  flutter: { name: 'Flutter', description: 'Cross-platform UI toolkit (Dart)' },
  // Backend
  node: { name: 'Node.js', description: 'Server-side JavaScript runtime' },
  express: { name: 'Express', description: 'Minimal Node.js web framework' },
  fastify: { name: 'Fastify', description: 'Fast Node.js web framework' },
  nestjs: { name: 'NestJS', description: 'Progressive Node.js framework' },
  django: { name: 'Django', description: 'Python web framework' },
  rails: { name: 'Rails', description: 'Ruby web framework' },
  laravel: { name: 'Laravel', description: 'PHP web framework' },
  go: { name: 'Go', description: 'Go programming language' },
  rust: { name: 'Rust', description: 'Rust programming language' },
  dotnet: { name: '.NET', description: 'Microsoft .NET platform' },
  // Static
  hugo: { name: 'Hugo', description: 'Go-based static site generator' },
  jekyll: { name: 'Jekyll', description: 'Ruby-based static site generator' },
  eleventy: { name: 'Eleventy', description: 'JavaScript static site generator' },
  // Desktop
  electron: { name: 'Electron', description: 'Cross-platform desktop apps' },
  tauri: { name: 'Tauri', description: 'Lightweight desktop apps (Rust)' },
  // Catch-all
  other: { name: 'Other', description: 'Unknown or unsupported framework' },
}

export function inferPlatform(stack: StackType): Platform {
  switch (stack) {
    case 'nuxt': case 'next': case 'astro': case 'sveltekit': case 'remix': case 'analog':
    case 'vue': case 'react': case 'svelte': case 'solid': case 'angular':
      return 'web'
    case 'react-native': case 'expo': case 'flutter':
      return 'mobile'
    case 'node': case 'express': case 'fastify': case 'nestjs':
    case 'django': case 'rails': case 'laravel': case 'go': case 'rust': case 'dotnet':
      return 'api'
    case 'electron': case 'tauri':
      return 'desktop'
    case 'hugo': case 'jekyll': case 'eleventy':
      return 'static'
    default:
      return 'other'
  }
}

/** Backward-compatible: returns just the StackType string */
export async function detectStack(projectRoot: string): Promise<StackType> {
  const info = await detectStackInfo(projectRoot)
  return info.stack
}

/** Rich detection: stack + platform + monorepo + features */
export async function detectStackInfo(projectRoot: string): Promise<StackInfo> {
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

  // Non-JS detection if still 'other'
  if (stack === 'other') {
    stack = await detectNonJs(projectRoot)
  }

  const mono = await detectMonorepo(projectRoot)
  const features = await detectFeatures(projectRoot)
  const meta = STACK_META[stack]

  return {
    stack,
    platform: inferPlatform(stack),
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

  // Meta-frameworks (check BEFORE plain frameworks)
  if ('nuxt' in allDeps) return 'nuxt'
  if ('next' in allDeps) return 'next'
  if ('astro' in allDeps) return 'astro'
  if ('@sveltejs/kit' in allDeps) return 'sveltekit'
  if ('@remix-run/node' in allDeps || 'remix' in allDeps) return 'remix'
  if ('@analogjs/platform' in allDeps) return 'analog'

  // Mobile (check before plain react)
  if ('expo' in allDeps) return 'expo'
  if ('react-native' in allDeps) return 'react-native'

  // Plain frameworks
  if ('vue' in allDeps) return 'vue'
  if ('svelte' in allDeps) return 'svelte'
  if ('solid-js' in allDeps) return 'solid'
  if ('@angular/core' in allDeps) return 'angular'
  if ('react' in allDeps) return 'react'

  // Desktop
  if ('electron' in allDeps) return 'electron'
  if ('@tauri-apps/api' in allDeps) return 'tauri'

  // Backend (Node.js)
  if ('@nestjs/core' in allDeps) return 'nestjs'
  if ('fastify' in allDeps) return 'fastify'
  if ('express' in allDeps) return 'express'

  // Static site generators
  if ('@11ty/eleventy' in allDeps) return 'eleventy'

  // Generic Node.js (has package.json but no framework)
  if ('node' in (pkg.dependencies ?? {})) return 'node'

  return 'other'
}

async function detectNonJs(projectRoot: string): Promise<StackType> {
  // Go
  if (await pathExists(join(projectRoot, 'go.mod'))) return 'go'

  // Rust
  if (await pathExists(join(projectRoot, 'Cargo.toml'))) return 'rust'

  // Python
  for (const f of ['requirements.txt', 'pyproject.toml', 'setup.py']) {
    if (await pathExists(join(projectRoot, f))) {
      // Check for Django
      try {
        const { readText } = await import('./fs.js')
        const content = await readText(join(projectRoot, f))
        if (content?.includes('django') || content?.includes('Django')) return 'django'
      } catch { /* ignore */ }
      return 'other' // Generic Python — no specific stack type yet
    }
  }

  // Ruby
  if (await pathExists(join(projectRoot, 'Gemfile'))) {
    try {
      const { readText } = await import('./fs.js')
      const content = await readText(join(projectRoot, 'Gemfile'))
      if (content?.includes('rails')) return 'rails'
    } catch { /* ignore */ }
    return 'other'
  }

  // .NET
  const dotnetFiles = ['*.csproj', '*.sln']
  for (const pattern of dotnetFiles) {
    if (pattern === '*.csproj' && await pathExists(join(projectRoot, 'Program.cs'))) return 'dotnet'
    if (pattern === '*.sln' && await pathExists(join(projectRoot, 'Program.cs'))) return 'dotnet'
  }

  // PHP / Laravel
  if (await pathExists(join(projectRoot, 'composer.json'))) {
    try {
      const composer = await readJson<Record<string, unknown>>(join(projectRoot, 'composer.json'))
      const require = composer?.require as Record<string, string> | undefined
      if (require?.['laravel/framework']) return 'laravel'
    } catch { /* ignore */ }
    return 'other'
  }

  // Flutter (Dart)
  if (await pathExists(join(projectRoot, 'pubspec.yaml'))) return 'flutter'

  // Hugo
  if (await pathExists(join(projectRoot, 'hugo.toml')) || await pathExists(join(projectRoot, 'config.toml'))) {
    try {
      const { readText } = await import('./fs.js')
      const content = await readText(join(projectRoot, 'config.toml'))
      if (content?.includes('baseURL') || content?.includes('hugo')) return 'hugo'
    } catch { /* ignore */ }
  }

  // Jekyll
  if (await pathExists(join(projectRoot, '_config.yml'))) return 'jekyll'

  return 'other'
}

async function detectMonorepo(projectRoot: string): Promise<{ isMonorepo: boolean; tool?: string }> {
  if (await pathExists(join(projectRoot, 'pnpm-workspace.yaml'))) return { isMonorepo: true, tool: 'pnpm workspaces' }
  if (await pathExists(join(projectRoot, 'lerna.json'))) return { isMonorepo: true, tool: 'Lerna' }
  if (await pathExists(join(projectRoot, 'nx.json'))) return { isMonorepo: true, tool: 'Nx' }
  if (await pathExists(join(projectRoot, 'turbo.json'))) return { isMonorepo: true, tool: 'Turborepo' }

  const pkg = await readJson<PackageJson>(join(projectRoot, 'package.json'))
  if (pkg?.workspaces) return { isMonorepo: true, tool: 'npm/yarn workspaces' }

  // Walk up
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
  const allDeps = await collectAllDeps(projectRoot)

  if ('typescript' in allDeps || await pathExists(join(projectRoot, 'tsconfig.json'))) features.push('TypeScript')

  const i18nLibs = ['vue-i18n', '@nuxtjs/i18n', 'next-intl', 'react-intl', 'i18next', 'react-i18next']
  for (const lib of i18nLibs) {
    if (lib in allDeps) { features.push(`i18n (${lib})`); break }
  }

  if ('tailwindcss' in allDeps) features.push('Tailwind CSS')
  else if ('sass' in allDeps || 'scss' in allDeps) features.push('Sass/SCSS')

  if ('vitest' in allDeps) features.push('Vitest')
  else if ('jest' in allDeps) features.push('Jest')

  if ('pinia' in allDeps) features.push('Pinia')
  else if ('zustand' in allDeps) features.push('Zustand')
  else if ('@reduxjs/toolkit' in allDeps || 'redux' in allDeps) features.push('Redux')

  return features
}

async function collectAllDeps(projectRoot: string): Promise<Record<string, string>> {
  const pkg = await readJson<PackageJson>(join(projectRoot, 'package.json'))
  const allDeps: Record<string, string> = { ...pkg?.dependencies, ...pkg?.devDependencies }

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

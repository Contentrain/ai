import type { StackType, Platform } from '@contentrain/types'
import { join, dirname } from 'node:path'
import { readdir } from 'node:fs/promises'
import { readJson, pathExists, readText } from './fs.js'

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

  // Look DOWN into the workspaces. The walk above handles "I am inside a
  // package, find the monorepo root"; this handles the opposite and more
  // common case — projectRoot IS the monorepo root, whose package.json holds
  // only tooling (turbo, nx) while the frameworks live in apps/* and
  // packages/*. Without this a Next.js monorepo reports `other`, and the
  // stack is what picks the replacement conventions during normalize.
  if (stack === 'other') {
    stack = await detectFromWorkspaces(projectRoot)
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

/**
 * Ranked by how strongly the stack determines content conventions — a
 * meta-framework dictates the i18n setup and the replacement expression,
 * a plain UI library does not. Frequency would be the wrong tie-break: a
 * monorepo with one Next app and two React packages is a Next project.
 */
const STACK_PRIORITY: readonly StackType[] = [
  'nuxt', 'next', 'astro', 'sveltekit', 'remix', 'analog',
  'expo', 'react-native',
  'vue', 'react', 'svelte', 'solid', 'angular',
  'electron', 'tauri',
  'nestjs', 'fastify', 'express',
  'eleventy', 'node',
]

/** Cap the fan-out so a large monorepo cannot turn detection into a crawl. */
const MAX_WORKSPACE_DIRS = 50

/**
 * Workspace globs from `pnpm-workspace.yaml` or the `workspaces` field.
 *
 * The pnpm file is parsed line by line rather than with a YAML library: we
 * need exactly one list of strings with a fixed shape, and a parser
 * dependency for that is not worth the install size.
 */
async function readWorkspacePatterns(root: string): Promise<string[]> {
  const pnpm = await readText(join(root, 'pnpm-workspace.yaml'))
  if (pnpm) {
    const patterns: string[] = []
    let inPackages = false
    for (const raw of pnpm.split('\n')) {
      const line = raw.replace(/#.*$/, '').trimEnd()
      if (/^packages:\s*$/.test(line)) { inPackages = true; continue }
      if (!inPackages) continue
      const item = /^\s+-\s*['"]?([^'"]+?)['"]?\s*$/.exec(line)
      if (item?.[1]) { patterns.push(item[1]); continue }
      if (line.trim() !== '') break // a new top-level key ends the list
    }
    if (patterns.length > 0) return patterns
  }

  const pkg = await readJson<PackageJson>(join(root, 'package.json'))
  const ws = pkg?.workspaces
  if (Array.isArray(ws)) return ws
  if (ws && Array.isArray(ws.packages)) return ws.packages
  return []
}

/**
 * Expand workspace patterns to directories. Only a trailing `*` segment is
 * expanded — that covers `apps/*` and `packages/*`, which is what real
 * workspace files use. Deeper globs and negations are skipped rather than
 * half-supported.
 */
async function listWorkspaceDirs(root: string): Promise<string[]> {
  const patterns = (await readWorkspacePatterns(root)).filter(p => !p.startsWith('!'))

  const expanded = await Promise.all(patterns.map(async (pattern) => {
    const star = pattern.indexOf('*')
    if (star === -1) return [join(root, pattern)]
    const base = join(root, pattern.slice(0, star).replace(/\/+$/, ''))
    try {
      const entries = await readdir(base, { withFileTypes: true })
      return entries.filter(e => e.isDirectory()).map(e => join(base, e.name))
    } catch {
      return []
    }
  }))

  return expanded.flat().slice(0, MAX_WORKSPACE_DIRS)
}

/** Highest-priority stack across the workspace packages. */
async function detectFromWorkspaces(root: string): Promise<StackType> {
  const dirs = await listWorkspaceDirs(root)
  if (dirs.length === 0) return 'other'

  const found = new Set(await Promise.all(dirs.map(d => detectFromDeps(d))))
  return STACK_PRIORITY.find(s => found.has(s)) ?? 'other'
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
        const content = await readText(join(projectRoot, f))
        if (content?.includes('django') || content?.includes('Django')) return 'django'
      } catch { /* ignore */ }
      return 'other' // Generic Python — no specific stack type yet
    }
  }

  // Ruby
  if (await pathExists(join(projectRoot, 'Gemfile'))) {
    try {
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
  if (await pathExists(join(projectRoot, 'hugo.toml'))) return 'hugo'
  if (await pathExists(join(projectRoot, 'config.toml'))) {
    try {
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

  // Same blind spot as stack detection: at a monorepo root the interesting
  // dependencies (the i18n library above all) sit in the workspace packages,
  // not in the root manifest. Reporting "no i18n" for a project that has it
  // would send normalize down the wrong path.
  const workspaceDirs = await listWorkspaceDirs(projectRoot)
  if (workspaceDirs.length > 0) {
    const pkgs = await Promise.all(
      workspaceDirs.map(d => readJson<PackageJson>(join(d, 'package.json'))),
    )
    for (const wsPkg of pkgs) {
      if (wsPkg) Object.assign(allDeps, wsPkg.dependencies, wsPkg.devDependencies)
    }
  }

  return allDeps
}

import { readdir } from 'node:fs/promises'
import { join, extname, basename } from 'node:path'
import { pathExists } from '../util/fs.js'

// ─── Shared Scan Constants ───

/** File extensions to scan across all JS/TS ecosystem projects */
export const SCAN_EXTENSIONS = new Set([
  '.tsx', '.jsx', '.vue', '.ts', '.js', '.mjs', '.astro', '.svelte',
])

/** Directory names to always exclude from scanning */
export const SCAN_IGNORE_DIRS = new Set([
  // Package managers / deps
  'node_modules', '.pnpm',
  // Build outputs
  'dist', 'build', 'out', '.output',
  // Framework caches
  '.nuxt', '.next', '.svelte-kit', '.expo', '.turbo', '.parcel-cache', '.vercel', '.netlify',
  // Test / coverage
  'coverage', '__tests__', '__mocks__',
  // VCS / IDE
  '.git', '.vscode', '.idea',
  // Contentrain
  '.contentrain',
])

/** Max files per scan operation */
export const MAX_SCAN_FILES = 500

/** File patterns to skip regardless of extension */
const SKIP_FILE_RE = /\.(test|spec)\.[^.]+$|\.d\.ts$|\.min\.[^.]+$/

// ─── File Classification ───
// Covers: React, Next.js, Nuxt, Vue, Astro, SvelteKit, Remix,
//         React Native/Expo, NestJS, Express, Fastify, Koa, Hapi

/** Directories that represent entry points / pages / screens */
const PAGE_DIR_NAMES = new Set([
  // Frontend routing
  'pages', 'routes', 'screens', 'views',
  // Backend entry points
  'controllers', 'handlers', 'resolvers',
])

/** Directories that represent reusable components / modules */
const COMPONENT_DIR_NAMES = new Set([
  // UI components
  'components', 'ui', 'widgets', 'elements',
  // Feature modules
  'features', 'modules',
  // Backend services
  'services', 'providers',
  // Shared / common
  'shared', 'common',
])

/** Directories that represent layouts / templates */
const LAYOUT_DIR_NAMES = new Set([
  'layouts', 'templates',
])

/** Next.js App Router special files that are page-like */
const NEXTJS_PAGE_FILES = new Set([
  'page.tsx', 'page.jsx', 'page.ts', 'page.js',
  'layout.tsx', 'layout.jsx', 'layout.ts', 'layout.js',
  'error.tsx', 'error.jsx',
  'loading.tsx', 'loading.jsx',
  'not-found.tsx', 'not-found.jsx',
])

/** Classify a file into page/component/layout/other based on path heuristics */
export function classifyFile(relPath: string): 'page' | 'component' | 'layout' | 'other' {
  const parts = relPath.split('/')
  const fileName = parts[parts.length - 1] ?? ''

  // Next.js App Router: files in app/ with special names are pages
  if (parts.includes('app') && NEXTJS_PAGE_FILES.has(fileName)) {
    return fileName.startsWith('layout') ? 'layout' : 'page'
  }

  // Check directory names in path (check layout first — more specific)
  for (const part of parts) {
    const lower = part.toLowerCase()
    if (LAYOUT_DIR_NAMES.has(lower)) return 'layout'
    if (PAGE_DIR_NAMES.has(lower)) return 'page'
    if (COMPONENT_DIR_NAMES.has(lower)) return 'component'
  }

  return 'other'
}

// ─── Source Directory Detection ───

/** Common source directories across all JS/TS project types */
const AUTO_DETECT_DIRS = [
  // Standard source
  'src', 'app', 'lib',
  // Frontend specific
  'pages', 'components', 'layouts', 'views',
  // Mobile
  'screens',
  // Backend
  'modules', 'routes', 'controllers', 'services',
  // Shared
  'features', 'shared', 'common',
  // Hooks / composables
  'hooks', 'composables',
  // Stores
  'stores',
]

/** Auto-detect which source directories exist in the project */
export async function autoDetectSourceDirs(projectRoot: string): Promise<string[]> {
  const found: string[] = []
  for (const dir of AUTO_DETECT_DIRS) {
    if (await pathExists(join(projectRoot, dir))) {
      found.push(dir)
    }
  }
  return found.length > 0 ? found : ['.']
}

// ─── File Discovery ───

export interface DiscoverFilesOptions {
  paths?: string[]
  include?: string[]
  exclude?: string[]
}

/**
 * Discover source files matching scan criteria.
 * Returns relative paths (relative to projectRoot).
 */
export async function discoverFiles(
  projectRoot: string,
  options?: DiscoverFilesOptions,
): Promise<string[]> {
  const extensions = options?.include
    ? new Set(options.include.map(e => e.startsWith('.') ? e : `.${e}`))
    : SCAN_EXTENSIONS
  const extraExcludes = new Set(options?.exclude ?? [])
  const scanDirs = options?.paths ?? await autoDetectSourceDirs(projectRoot)

  const files: string[] = []

  for (const dir of scanDirs) {
    const absDir = join(projectRoot, dir)
    if (!(await pathExists(absDir))) continue

    let entries: string[]
    try {
      entries = await readdir(absDir, { recursive: true }) as unknown as string[]
    } catch {
      continue
    }

    for (const entry of entries) {
      if (files.length >= MAX_SCAN_FILES) break

      const fileName = basename(entry)

      // Check if any path segment is excluded
      const pathSegments = entry.split('/')
      if (pathSegments.some(seg => SCAN_IGNORE_DIRS.has(seg) || extraExcludes.has(seg))) continue

      // Check extension
      if (!extensions.has(extname(fileName))) continue

      // Skip test/spec/declaration/minified files
      if (SKIP_FILE_RE.test(fileName)) continue

      files.push(join(dir, entry))
    }

    if (files.length >= MAX_SCAN_FILES) break
  }

  return files.toSorted((a, b) => a.localeCompare(b)).slice(0, MAX_SCAN_FILES)
}

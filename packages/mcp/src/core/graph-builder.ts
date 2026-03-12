import type { FileCategory, GraphNode, ProjectGraph } from '@contentrain/types'
import { join, relative, dirname, extname } from 'node:path'
import { readText, pathExists } from '../util/fs.js'
import {
  SCAN_EXTENSIONS,
  classifyFile,
  autoDetectSourceDirs,
  discoverFiles,
} from './scan-config.js'

export interface BuildGraphOptions {
  paths?: string[]
  include?: string[]
  exclude?: string[]
}

const MAX_ORPHANS = 10

// ---------------------------------------------------------------------------
// Import extraction
// ---------------------------------------------------------------------------

const IMPORT_RE = /(?:import|export)\s+.*?from\s+['"]([^'"]+)['"]|(?:import|require)\s*\(\s*['"]([^'"]+)['"]\s*\)/g

function extractImportPaths(content: string): string[] {
  const paths: string[] = []
  let m: RegExpExecArray | null
  // Reset lastIndex before use since we reuse the regex
  IMPORT_RE.lastIndex = 0
  while ((m = IMPORT_RE.exec(content)) !== null) {
    const p = m[1] ?? m[2]
    if (p && isLocalImport(p)) {
      paths.push(p)
    }
  }
  return paths
}

function isLocalImport(p: string): boolean {
  return p.startsWith('.') || p.startsWith('/')
}

// ---------------------------------------------------------------------------
// Component name extraction from imports
// ---------------------------------------------------------------------------

const NAMED_IMPORT_RE = /import\s+(?:type\s+)?(?:(\w+)(?:\s*,\s*)?)?(?:\{([^}]*)\})?\s+from\s+['"][^'"]+['"]/g
const DEFAULT_IMPORT_RE = /import\s+(?:type\s+)?(\w+)\s+from\s+['"][^'"]+['"]/g

function isPascalCase(name: string): boolean {
  return /^[A-Z][a-zA-Z0-9]*$/.test(name)
}

function extractComponentNames(content: string): string[] {
  const names = new Set<string>()

  // Default imports: `import Button from '...'`
  DEFAULT_IMPORT_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = DEFAULT_IMPORT_RE.exec(content)) !== null) {
    const name = m[1]
    if (name && isPascalCase(name)) {
      names.add(name)
    }
  }

  // Named imports: `import { Button, useHook } from '...'`
  NAMED_IMPORT_RE.lastIndex = 0
  while ((m = NAMED_IMPORT_RE.exec(content)) !== null) {
    // Default part before destructuring
    const defaultName = m[1]
    if (defaultName && isPascalCase(defaultName)) {
      names.add(defaultName)
    }
    // Destructured names
    const namedPart = m[2]
    if (namedPart) {
      for (const segment of namedPart.split(',')) {
        // Handle `Foo as Bar` — take the local name (Bar)
        const parts = segment.trim().split(/\s+as\s+/)
        const localName = (parts[1] ?? parts[0])?.trim()
        if (localName && isPascalCase(localName)) {
          names.add(localName)
        }
      }
    }
  }

  return [...names]
}

// ---------------------------------------------------------------------------
// String counting (estimate)
// ---------------------------------------------------------------------------

const STRING_SINGLE_RE = /'[^'\\]*(?:\\.[^'\\]*)*'/g
const STRING_DOUBLE_RE = /"[^"\\]*(?:\\.[^"\\]*)*"/g
const STRING_TEMPLATE_RE = /`[^`\\]*(?:\\.[^`\\]*)*`/g

function countStrings(content: string): number {
  // Strip import/export/require lines first so their string literals don't count
  const stripped = content.replace(/^(?:import|export)\s+.*$/gm, '')
    .replace(/\brequire\s*\([^)]*\)/g, '')

  const singles = stripped.match(STRING_SINGLE_RE)?.length ?? 0
  const doubles = stripped.match(STRING_DOUBLE_RE)?.length ?? 0
  const templates = stripped.match(STRING_TEMPLATE_RE)?.length ?? 0

  return singles + doubles + templates
}

// ---------------------------------------------------------------------------
// Import path resolution
// ---------------------------------------------------------------------------

const RESOLVE_EXTENSIONS = [...SCAN_EXTENSIONS]
const RESOLVE_INDEX_FILES = ['index.ts', 'index.tsx', 'index.js']

async function resolveImportPath(
  importPath: string,
  importerDir: string,
  projectRoot: string,
): Promise<string | null> {
  const base = importPath.startsWith('/')
    ? join(projectRoot, importPath)
    : join(importerDir, importPath)

  // If it already has an extension, check directly
  if (extname(base)) {
    if (await pathExists(base)) {
      return base
    }
    return null
  }

  // Try adding extensions
  for (const ext of RESOLVE_EXTENSIONS) {
    const candidate = base + ext
    if (await pathExists(candidate)) {
      return candidate
    }
  }

  // Try index files inside directory
  for (const idx of RESOLVE_INDEX_FILES) {
    const candidate = join(base, idx)
    if (await pathExists(candidate)) {
      return candidate
    }
  }

  return null
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

interface FileInfo {
  relPath: string
  imports: string[]
  components: string[]
  strings: number
  category: FileCategory
}

export async function buildGraph(
  projectRoot: string,
  options?: BuildGraphOptions,
): Promise<ProjectGraph> {
  const scanDirs = options?.paths ?? await autoDetectSourceDirs(projectRoot)

  // ---- File discovery (shared with scanner) ----
  const filePaths = await discoverFiles(projectRoot, {
    paths: scanDirs,
    include: options?.include,
    exclude: options?.exclude,
  })

  // ---- Pass 1: Parse each file ----
  const fileMap = new Map<string, FileInfo>()

  const parsePromises = filePaths.map(async (relPath) => {
    const absPath = join(projectRoot, relPath)
    const content = await readText(absPath)
    if (content === null) return

    const imports = extractImportPaths(content)
    const components = extractComponentNames(content)
    const strings = countStrings(content)
    const category = classifyFile(relPath)

    fileMap.set(relPath, { relPath, imports, components, strings, category })
  })

  await Promise.all(parsePromises)

  // ---- Pass 2: Resolve imports and build reverse lookup ----
  const usedByMap = new Map<string, Set<string>>()

  // Initialize usedBy sets
  for (const relPath of fileMap.keys()) {
    usedByMap.set(relPath, new Set())
  }

  const resolvePromises: Promise<void>[] = []

  for (const [relPath, info] of fileMap) {
    const importerAbsDir = dirname(join(projectRoot, relPath))

    for (const rawImport of info.imports) {
      resolvePromises.push(
        resolveImportPath(rawImport, importerAbsDir, projectRoot).then((resolved) => {
          if (!resolved) return
          const resolvedRel = relative(projectRoot, resolved)
          const targetSet = usedByMap.get(resolvedRel)
          if (targetSet) {
            targetSet.add(relPath)
          }
        }),
      )
    }
  }

  await Promise.all(resolvePromises)

  // ---- Build nodes ----
  const pages: GraphNode[] = []
  const components: GraphNode[] = []
  const layouts: GraphNode[] = []
  const orphanCandidates: string[] = []

  let totalStrings = 0

  for (const [relPath, info] of fileMap) {
    const usedBy = [...(usedByMap.get(relPath) ?? [])]
    totalStrings += info.strings

    // Filter out nodes with 0 strings — not relevant for content extraction
    if (info.strings === 0 && info.category !== 'other') continue

    const node: GraphNode = {
      file: relPath,
      category: info.category,
      imports: info.imports,
      used_by: usedBy,
      strings: info.strings,
    }

    // Only attach components list for pages
    if (info.category === 'page' && info.components.length > 0) {
      node.components = info.components
    }

    switch (info.category) {
      case 'page':
        pages.push(node)
        break
      case 'component':
        components.push(node)
        break
      case 'layout':
        layouts.push(node)
        break
      default:
        // Orphan = "other" category with no inbound references and no outbound imports
        if (usedBy.length === 0 && info.imports.length === 0) {
          orphanCandidates.push(relPath)
        }
        break
    }
  }

  return {
    pages,
    components,
    layouts,
    orphan_files: orphanCandidates.slice(0, MAX_ORPHANS),
    stats: {
      total_files: fileMap.size,
      total_components: components.length,
      total_pages: pages.length,
      total_strings_estimate: totalStrings,
    },
  }
}

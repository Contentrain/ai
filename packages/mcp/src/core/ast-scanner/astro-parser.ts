// ─── Astro Parser for Scanner v2 ───
// Parses .astro files using @astrojs/compiler.
// Extracts ALL strings with structural context metadata.
// Scanner does NOT classify — agent does. When in doubt, INCLUDE.

import type { ExtractedString } from './types.js'

// ─── Lazy-loaded @astrojs/compiler ───

// Astro AST node types from @astrojs/compiler
interface AstroBaseNode {
  type: string
  position?: {
    start: { line: number; column: number; offset: number }
    end?: { line: number; column: number; offset: number }
  }
}

interface AstroRoot extends AstroBaseNode {
  type: 'root'
  children: AstroNode[]
}

interface AstroElement extends AstroBaseNode {
  type: 'element'
  name: string
  attributes: AstroAttribute[]
  children: AstroNode[]
}

interface AstroComponent extends AstroBaseNode {
  type: 'component'
  name: string
  attributes: AstroAttribute[]
  children: AstroNode[]
}

interface AstroCustomElement extends AstroBaseNode {
  type: 'custom-element'
  name: string
  attributes: AstroAttribute[]
  children: AstroNode[]
}

interface AstroFragment extends AstroBaseNode {
  type: 'fragment'
  children: AstroNode[]
}

interface AstroText extends AstroBaseNode {
  type: 'text'
  value: string
}

interface AstroExpression extends AstroBaseNode {
  type: 'expression'
  children: AstroNode[]
}

interface AstroFrontmatter extends AstroBaseNode {
  type: 'frontmatter'
  value: string
}

interface AstroComment extends AstroBaseNode {
  type: 'comment'
  value: string
}

interface AstroDoctype extends AstroBaseNode {
  type: 'doctype'
}

interface AstroAttribute {
  name: string
  type: 'attribute' | 'expression' | 'spread' | 'shorthand' | 'template-literal'
  kind: string
  value: string
  raw?: string
  position?: {
    start: { line: number; column: number; offset: number }
    end?: { line: number; column: number; offset: number }
  }
}

type AstroNode =
  | AstroRoot
  | AstroElement
  | AstroComponent
  | AstroCustomElement
  | AstroFragment
  | AstroText
  | AstroExpression
  | AstroFrontmatter
  | AstroComment
  | AstroDoctype
  | AstroBaseNode

interface AstroParseResult {
  ast: AstroRoot
}

interface AstroCompiler {
  parse: (source: string, options?: { position?: boolean }) => Promise<AstroParseResult>
}

let _compiler: AstroCompiler | null = null

async function loadCompiler(): Promise<AstroCompiler> {
  if (_compiler) return _compiler
  try {
    const mod = await import('@astrojs/compiler')
    _compiler = mod as unknown as AstroCompiler
    return _compiler
  } catch {
    throw new Error(
      '@astrojs/compiler is required to parse .astro files. '
      + 'Install it with: pnpm add -D @astrojs/compiler',
    )
  }
}

// ─── tsx-parser delegation ───

type TsxParserFn = (content: string, fileName: string) => ExtractedString[]

let _tsxParser: TsxParserFn | null = null

async function loadTsxParser(): Promise<TsxParserFn | null> {
  if (_tsxParser) return _tsxParser
  try {
    const mod = await import('./tsx-parser.js')
    _tsxParser = mod.parseTsx
    return _tsxParser
  } catch {
    return null
  }
}

// ─── Constants ───

const SURROUNDING_MAX = 120

/** Attributes whose values are CSS, not content */
const CSS_ATTRIBUTES = new Set(['class', 'style', 'className'])

/** Event/code attribute prefixes — skip these */
const CODE_ATTRIBUTE_PREFIXES = ['on', 'set:', 'define:', 'is:']

// ─── Helpers ───

function getSurroundingByLine(content: string, line: number): string {
  const lines = content.split('\n')
  const idx = line - 1
  const start = Math.max(0, idx - 1)
  const end = Math.min(lines.length - 1, idx + 1)

  const parts: string[] = []
  for (let i = start; i <= end; i++) {
    const l = lines[i]
    if (l !== undefined) {
      parts.push(l)
    }
  }

  const joined = parts.join('\n')
  if (joined.length > SURROUNDING_MAX) {
    return joined.slice(0, SURROUNDING_MAX)
  }
  return joined
}

function _getLineAndColumn(content: string, offset: number): { line: number; column: number } {
  let line = 1
  let lastNewline = -1

  for (let i = 0; i < offset && i < content.length; i++) {
    if (content[i] === '\n') {
      line++
      lastNewline = i
    }
  }

  return { line, column: offset - lastNewline }
}

// ─── Template AST Walker ───

function walkAstroTemplate(
  node: AstroNode,
  content: string,
  results: ExtractedString[],
  parentTag: string = '',
): void {
  const nodeType = node.type

  switch (nodeType) {
    case 'root': {
      const root = node as AstroRoot
      for (const child of root.children) {
        walkAstroTemplate(child, content, results, parentTag)
      }
      break
    }

    case 'text': {
      const textNode = node as AstroText
      const trimmed = textNode.value.trim()
      if (trimmed.length > 0 && /\S/.test(trimmed)) {
        const line = textNode.position?.start.line ?? 1
        const column = textNode.position?.start.column ?? 1
        results.push({
          value: trimmed,
          line,
          column,
          context: 'template_text',
          scope: 'template',
          parent: parentTag,
          surrounding: getSurroundingByLine(content, line),
        })
      }
      break
    }

    case 'element':
    case 'component':
    case 'custom-element': {
      const el = node as AstroElement | AstroComponent | AstroCustomElement
      const tag = el.name

      // Process attributes
      for (const attr of el.attributes) {
        processAttribute(attr, tag, content, results)
      }

      // Recurse into children
      for (const child of el.children) {
        walkAstroTemplate(child, content, results, tag)
      }
      break
    }

    case 'fragment': {
      const fragment = node as AstroFragment
      for (const child of fragment.children) {
        walkAstroTemplate(child, content, results, parentTag)
      }
      break
    }

    case 'expression': {
      // JSX expressions like {variable} — code, skip
      // (The agent decides if embedded strings in expressions matter)
      break
    }

    case 'frontmatter':
    case 'comment':
    case 'doctype': {
      // Frontmatter is handled separately via tsx-parser delegation
      // Comments and doctype are skipped
      break
    }

    default: {
      // For unknown node types, try to walk children
      const unknownNode = node as AstroBaseNode & { children?: AstroNode[] }
      if (unknownNode.children) {
        for (const child of unknownNode.children) {
          walkAstroTemplate(child, content, results, parentTag)
        }
      }
      break
    }
  }
}

function processAttribute(
  attr: AstroAttribute,
  parentTag: string,
  content: string,
  results: ExtractedString[],
): void {
  const attrName = attr.name

  // Skip expression attributes (dynamic bindings) and spread attributes
  if (attr.type === 'expression' || attr.type === 'spread' || attr.type === 'shorthand') return

  // Skip code-related attributes (event handlers, directives)
  for (const prefix of CODE_ATTRIBUTE_PREFIXES) {
    if (attrName.startsWith(prefix)) return
  }

  // Skip boolean attributes (no value)
  const attrValue = attr.value
  if (!attrValue || (typeof attrValue === 'string' && attrValue.trim().length === 0)) return

  const line = attr.position?.start.line ?? 1
  const column = attr.position?.start.column ?? 1

  // CSS attributes get css_class context
  if (CSS_ATTRIBUTES.has(attrName)) {
    results.push({
      value: attrValue,
      line,
      column,
      context: 'css_class',
      scope: 'template',
      parent: parentTag,
      parentProperty: attrName,
      surrounding: getSurroundingByLine(content, line),
    })
    return
  }

  results.push({
    value: attrValue,
    line,
    column,
    context: 'template_attribute',
    scope: 'template',
    parent: parentTag,
    parentProperty: attrName,
    surrounding: getSurroundingByLine(content, line),
  })
}

// ─── Frontmatter Parsing ───

function findFrontmatter(ast: AstroRoot): AstroFrontmatter | null {
  for (const child of ast.children) {
    if (child.type === 'frontmatter') {
      return child as AstroFrontmatter
    }
  }
  return null
}

// ─── Main Export ───

export async function parseAstro(content: string, fileName: string): Promise<ExtractedString[]> {
  const compiler = await loadCompiler()
  const results: ExtractedString[] = []

  let parseResult: AstroParseResult
  try {
    parseResult = await compiler.parse(content, { position: true })
  } catch {
    // If Astro parsing fails, return empty — malformed files shouldn't block scanning
    return []
  }

  const ast = parseResult.ast

  // ─── Frontmatter → tsx-parser ───
  const frontmatter = findFrontmatter(ast)
  if (frontmatter && frontmatter.value.trim().length > 0) {
    const tsxParser = await loadTsxParser()
    if (tsxParser) {
      const frontmatterContent = frontmatter.value
      // Frontmatter starts after the opening ---
      const frontmatterLine = frontmatter.position?.start.line ?? 1
      // The content starts on the line after ---
      const contentStartLine = frontmatterLine + 1

      // Astro frontmatter is always TypeScript — resolve filename accordingly
      const resolvedFileName = fileName.replace(/\.astro$/, '.ts')
      const scriptResults = tsxParser(frontmatterContent, resolvedFileName)
      for (const r of scriptResults) {
        results.push({
          ...r,
          line: r.line + contentStartLine - 1,
          scope: 'script',
        })
      }
    }
  }

  // ─── Template (everything outside frontmatter) ───
  walkAstroTemplate(ast, content, results)

  return results
}

// ─── Svelte SFC Parser for Scanner v2 ───
// Parses .svelte Single File Components using svelte/compiler.
// Extracts ALL strings with structural context metadata.
// Scanner does NOT classify — agent does. When in doubt, INCLUDE.

import type { ExtractedString } from './types.js'

// ─── Lazy-loaded svelte/compiler ───

interface _SvelteLoc {
  start: number
  end: number
  line: number
  column: number
}

// Svelte AST node types from svelte/compiler parse()
interface SvelteBaseNode {
  type: string
  start: number
  end: number
}

interface SvelteFragment extends SvelteBaseNode {
  type: 'Fragment'
  children: SvelteNode[]
}

interface SvelteElement extends SvelteBaseNode {
  type: 'Element' | 'InlineComponent' | 'SlotTemplate' | 'Slot' | 'Head' | 'Title' | 'Window' | 'Document' | 'Body'
  name: string
  attributes: SvelteAttribute[]
  children: SvelteNode[]
}

interface SvelteText extends SvelteBaseNode {
  type: 'Text'
  data: string
  raw: string
}

interface SvelteAttribute extends SvelteBaseNode {
  type: 'Attribute'
  name: string
  value: SvelteAttributeValue[]
}

interface SvelteAttributeText extends SvelteBaseNode {
  type: 'Text'
  data: string
  raw: string
}

type SvelteAttributeValue = SvelteAttributeText | SvelteMustacheTag | SvelteBaseNode

interface _SvelteSpread extends SvelteBaseNode {
  type: 'Spread'
}

interface SvelteMustacheTag extends SvelteBaseNode {
  type: 'MustacheTag'
  expression: SvelteBaseNode
}

interface SvelteIfBlock extends SvelteBaseNode {
  type: 'IfBlock'
  expression: SvelteBaseNode
  children: SvelteNode[]
  else?: SvelteElseBlock
}

interface SvelteElseBlock extends SvelteBaseNode {
  type: 'ElseBlock'
  children: SvelteNode[]
}

interface SvelteEachBlock extends SvelteBaseNode {
  type: 'EachBlock'
  expression: SvelteBaseNode
  children: SvelteNode[]
  else?: SvelteElseBlock
}

interface SvelteAwaitBlock extends SvelteBaseNode {
  type: 'AwaitBlock'
  pending: SvelteFragment | null
  then: SvelteFragment | null
  catch: SvelteFragment | null
}

interface SvelteKeyBlock extends SvelteBaseNode {
  type: 'KeyBlock'
  children: SvelteNode[]
}

interface SvelteRawMustacheTag extends SvelteBaseNode {
  type: 'RawMustacheTag'
  expression: SvelteBaseNode
}

interface SvelteDirective extends SvelteBaseNode {
  type: 'EventHandler' | 'Binding' | 'Action' | 'Class' | 'StyleDirective' | 'Transition' | 'Animation' | 'Let' | 'Ref'
  name: string
}

interface SvelteScript extends SvelteBaseNode {
  type: 'Script'
  content: string
  context?: string // "module" for <script context="module">
}

interface SvelteStyle extends SvelteBaseNode {
  type: 'Style'
}

type SvelteNode =
  | SvelteFragment
  | SvelteElement
  | SvelteText
  | SvelteMustacheTag
  | SvelteIfBlock
  | SvelteEachBlock
  | SvelteAwaitBlock
  | SvelteKeyBlock
  | SvelteRawMustacheTag
  | SvelteBaseNode

interface SvelteAst {
  html: SvelteFragment
  instance?: SvelteScript
  module?: SvelteScript
  css?: SvelteStyle
}

interface SvelteCompiler {
  parse: (source: string, options?: { filename?: string }) => SvelteAst
}

let _compiler: SvelteCompiler | null = null

async function loadCompiler(): Promise<SvelteCompiler> {
  if (_compiler) return _compiler
  try {
    const mod = await import('svelte/compiler')
    _compiler = mod as unknown as SvelteCompiler
    return _compiler
  } catch {
    throw new Error(
      'svelte is required to parse .svelte files. '
      + 'Install it with: pnpm add -D svelte',
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
const CSS_ATTRIBUTES = new Set(['class', 'style'])

/** Directive types that contain code, not content */
const CODE_DIRECTIVE_TYPES = new Set([
  'EventHandler',  // on:click
  'Binding',       // bind:value
  'Action',        // use:action
  'Class',         // class:name
  'StyleDirective', // style:color
  'Transition',    // transition:fade
  'Animation',     // animate:flip
  'Let',           // let:item
  'Ref',           // ref (legacy)
])

// ─── Helpers ───

function getLineAndColumn(content: string, offset: number): { line: number; column: number } {
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

// ─── Template AST Walker ───

function walkTemplate(
  node: SvelteNode,
  content: string,
  results: ExtractedString[],
  parentTag: string = '',
): void {
  const nodeType = node.type

  switch (nodeType) {
    case 'Fragment': {
      const fragment = node as SvelteFragment
      for (const child of fragment.children) {
        walkTemplate(child, content, results, parentTag)
      }
      break
    }

    case 'Text': {
      const textNode = node as SvelteText
      const trimmed = textNode.data.trim()
      if (trimmed.length > 0 && /\S/.test(trimmed)) {
        const pos = getLineAndColumn(content, textNode.start)
        results.push({
          value: trimmed,
          line: pos.line,
          column: pos.column,
          context: 'template_text',
          scope: 'template',
          parent: parentTag,
          surrounding: getSurroundingByLine(content, pos.line),
        })
      }
      break
    }

    case 'Element':
    case 'InlineComponent':
    case 'SlotTemplate':
    case 'Slot':
    case 'Head':
    case 'Title':
    case 'Window':
    case 'Document':
    case 'Body': {
      const el = node as SvelteElement
      const tag = el.name

      // Process attributes
      for (const attr of el.attributes) {
        processAttribute(attr, tag, content, results)
      }

      // Recurse into children
      for (const child of el.children) {
        walkTemplate(child, content, results, tag)
      }
      break
    }

    case 'IfBlock': {
      const ifBlock = node as SvelteIfBlock
      // Skip the expression (code) — walk children for content
      for (const child of ifBlock.children) {
        walkTemplate(child, content, results, parentTag)
      }
      // Walk else branch
      if (ifBlock.else) {
        walkTemplate(ifBlock.else, content, results, parentTag)
      }
      break
    }

    case 'ElseBlock': {
      const elseBlock = node as SvelteElseBlock
      for (const child of elseBlock.children) {
        walkTemplate(child, content, results, parentTag)
      }
      break
    }

    case 'EachBlock': {
      const eachBlock = node as SvelteEachBlock
      // Skip the expression — walk children for content
      for (const child of eachBlock.children) {
        walkTemplate(child, content, results, parentTag)
      }
      if (eachBlock.else) {
        walkTemplate(eachBlock.else, content, results, parentTag)
      }
      break
    }

    case 'AwaitBlock': {
      const awaitBlock = node as SvelteAwaitBlock
      if (awaitBlock.pending) {
        walkTemplate(awaitBlock.pending, content, results, parentTag)
      }
      if (awaitBlock.then) {
        walkTemplate(awaitBlock.then, content, results, parentTag)
      }
      if (awaitBlock.catch) {
        walkTemplate(awaitBlock.catch, content, results, parentTag)
      }
      break
    }

    case 'KeyBlock': {
      const keyBlock = node as SvelteKeyBlock
      for (const child of keyBlock.children) {
        walkTemplate(child, content, results, parentTag)
      }
      break
    }

    case 'MustacheTag':
    case 'RawMustacheTag': {
      // {expression} or {@html expression} — code expressions, skip
      break
    }

    default: {
      // For unknown node types, try to walk children
      const unknownNode = node as SvelteBaseNode & { children?: SvelteNode[] }
      if (unknownNode.children) {
        for (const child of unknownNode.children) {
          walkTemplate(child, content, results, parentTag)
        }
      }
      break
    }
  }
}

function processAttribute(
  attr: SvelteAttribute | SvelteDirective | SvelteBaseNode,
  parentTag: string,
  content: string,
  results: ExtractedString[],
): void {
  // Skip directive types (EventHandler, Binding, etc.) — they contain code
  if (CODE_DIRECTIVE_TYPES.has(attr.type)) return

  // Only process regular Attribute nodes
  if (attr.type !== 'Attribute') return

  const attribute = attr as SvelteAttribute
  const attrName = attribute.name

  // Skip if no value or empty value array
  if (!attribute.value || attribute.value.length === 0) return

  // Process each value segment (attribute values can be arrays in Svelte)
  for (const valuePart of attribute.value) {
    if (valuePart.type !== 'Text') continue

    const textValue = (valuePart as SvelteAttributeText).data
    if (!textValue || textValue.trim().length === 0) continue

    const pos = getLineAndColumn(content, valuePart.start)

    // CSS attributes get css_class context
    if (CSS_ATTRIBUTES.has(attrName)) {
      results.push({
        value: textValue,
        line: pos.line,
        column: pos.column,
        context: 'css_class',
        scope: 'template',
        parent: parentTag,
        parentProperty: attrName,
        surrounding: getSurroundingByLine(content, pos.line),
      })
      continue
    }

    results.push({
      value: textValue,
      line: pos.line,
      column: pos.column,
      context: 'template_attribute',
      scope: 'template',
      parent: parentTag,
      parentProperty: attrName,
      surrounding: getSurroundingByLine(content, pos.line),
    })
  }
}

// ─── Script Block Parsing ───

/**
 * Resolve script filename with correct extension for TypeScript parser.
 * Svelte files with <script lang="ts"> need ScriptKind.TS, not ScriptKind.JS.
 */
function resolveScriptFileName(svelteFileName: string, lang?: string): string {
  if (lang === 'ts' || lang === 'typescript') return svelteFileName.replace(/\.svelte$/, '.ts')
  return svelteFileName.replace(/\.svelte$/, '.js')
}

function parseScriptBlock(
  scriptContent: string,
  scriptStartOffset: number,
  fullContent: string,
  fileName: string,
  parseTsx: TsxParserFn,
  lang?: string,
): ExtractedString[] {
  const resolvedFileName = resolveScriptFileName(fileName, lang)
  const scriptResults = parseTsx(scriptContent, resolvedFileName)
  const scriptStartPos = getLineAndColumn(fullContent, scriptStartOffset)
  const scriptStartLine = scriptStartPos.line

  return scriptResults.map(r => {
    r.line = r.line + scriptStartLine - 1
    r.scope = 'script'
    return r
  })
}

// ─── Main Export ───

export async function parseSvelte(content: string, fileName: string): Promise<ExtractedString[]> {
  const compiler = await loadCompiler()
  const results: ExtractedString[] = []

  let ast: SvelteAst
  try {
    ast = compiler.parse(content, { filename: fileName })
  } catch {
    // If Svelte parsing fails, return empty — malformed files shouldn't block scanning
    return []
  }

  // ─── Template (html) ───
  if (ast.html) {
    walkTemplate(ast.html, content, results)
  }

  // ─── Script Block ───
  const tsxParser = await loadTsxParser()
  if (tsxParser) {
    if (ast.instance) {
      // <script> block — extract its content from source
      const scriptStart = ast.instance.start
      const scriptEnd = ast.instance.end

      // Find the content between <script> tags
      const scriptSource = content.slice(scriptStart, scriptEnd)
      const scriptContentMatch = scriptSource.match(/<script[^>]*>([\s\S]*?)<\/script>/)
      if (scriptContentMatch?.[1]) {
        const scriptContentStr = scriptContentMatch[1]
        // Extract lang attribute from <script lang="ts">
        const langMatch = scriptSource.match(/<script[^>]*\slang=["'](\w+)["']/)
        const scriptLang = langMatch?.[1]
        // Calculate offset of script content within the file
        const scriptTagEnd = scriptSource.indexOf('>') + 1
        const contentOffset = scriptStart + scriptTagEnd
        const scriptResults = parseScriptBlock(
          scriptContentStr,
          contentOffset,
          content,
          fileName,
          tsxParser,
          scriptLang,
        )
        results.push(...scriptResults)
      }
    }

    if (ast.module) {
      // <script context="module"> block
      const moduleStart = ast.module.start
      const moduleEnd = ast.module.end
      const moduleSource = content.slice(moduleStart, moduleEnd)
      const moduleContentMatch = moduleSource.match(/<script[^>]*>([\s\S]*?)<\/script>/)
      if (moduleContentMatch?.[1]) {
        const moduleContentStr = moduleContentMatch[1]
        const moduleLangMatch = moduleSource.match(/<script[^>]*\slang=["'](\w+)["']/)
        const moduleLang = moduleLangMatch?.[1]
        const scriptTagEnd = moduleSource.indexOf('>') + 1
        const contentOffset = moduleStart + scriptTagEnd
        const moduleResults = parseScriptBlock(
          moduleContentStr,
          contentOffset,
          content,
          fileName,
          tsxParser,
          moduleLang,
        )
        results.push(...moduleResults)
      }
    }
  }

  // Style blocks are intentionally skipped — no content strings in CSS

  return results
}

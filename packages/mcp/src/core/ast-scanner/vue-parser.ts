// ─── Vue SFC Parser for Scanner v2 ───
// Parses .vue Single File Components using @vue/compiler-sfc.
// Extracts ALL strings with structural context metadata.
// Scanner does NOT classify — agent does. When in doubt, INCLUDE.

// ─── Types ───

import type { ExtractedString } from './types.js'
export type { ExtractedString }

// ─── Lazy-loaded @vue/compiler-sfc ───

interface VueCompilerSFC {
  parse: (source: string, options?: { filename?: string }) => {
    descriptor: {
      template: {
        content: string
        loc: { start: { line: number; column: number; offset: number } }
        ast?: VueTemplateNode
      } | null
      script: {
        content: string
        loc: { start: { line: number; column: number; offset: number } }
        lang?: string
      } | null
      scriptSetup: {
        content: string
        loc: { start: { line: number; column: number; offset: number } }
        lang?: string
      } | null
    }
  }
  compileTemplate: (options: {
    source: string
    filename: string
    id: string
  }) => {
    ast?: VueTemplateNode
  }
}

// Vue template AST node types
const NodeTypes = {
  ROOT: 0,
  ELEMENT: 1,
  TEXT: 2,
  COMMENT: 3,
  SIMPLE_EXPRESSION: 4,
  INTERPOLATION: 5,
  ATTRIBUTE: 6,
  DIRECTIVE: 7,
  COMPOUND_EXPRESSION: 8,
  IF: 9,
  IF_BRANCH: 10,
  FOR: 11,
  TEXT_CALL: 12,
  VNODE_CALL: 13,
  JS_CALL_EXPRESSION: 14,
} as const

interface VueTemplateLoc {
  start: { line: number; column: number; offset: number }
  end: { line: number; column: number; offset: number }
  source: string
}

interface VueTemplateNode {
  type: number
  loc: VueTemplateLoc
  children?: VueTemplateNode[]
  tag?: string // for ELEMENT
  props?: VueTemplateProp[]
  content?: VueTemplateNode | string // for INTERPOLATION, TEXT, SIMPLE_EXPRESSION
  branches?: VueTemplateNode[] // for IF
}

interface VueTemplateProp {
  type: number // ATTRIBUTE (6) or DIRECTIVE (7)
  name: string
  loc: VueTemplateLoc
  value?: {
    type: number
    content: string
    loc: VueTemplateLoc
  }
  exp?: {
    type: number
    content: string
    loc: VueTemplateLoc
  }
  arg?: {
    type: number
    content: string
    loc: VueTemplateLoc
  }
}

let _compiler: VueCompilerSFC | null = null

async function loadCompiler(): Promise<VueCompilerSFC> {
  if (_compiler) return _compiler
  try {
    // Dynamic import — @vue/compiler-sfc is optional
    const mod = await import('@vue/compiler-sfc')
    _compiler = mod as unknown as VueCompilerSFC
    return _compiler
  } catch {
    throw new Error(
      '@vue/compiler-sfc is required to parse .vue files. '
      + 'Install it with: pnpm add -D @vue/compiler-sfc',
    )
  }
}

// ─── Directives that contain code expressions (not user content) ───

const CODE_DIRECTIVES = new Set([
  'if', 'else-if', 'else', 'show',
  'for',
  'on', // @click, v-on:click
  'model',
  'memo',
  'once',
  'pre',
  'cloak',
  'is',
  'slot',
  'key',
])

// Directive args that are code/binding expressions, not content
const CODE_DIRECTIVE_ARGS = new Set([
  'class', 'style', // :class, :style → CSS bindings
  'key',
  'ref',
  'is',
])

// Static attributes whose values are CSS, not content
const CSS_ATTRIBUTES = new Set([
  'class', 'style',
])

// ─── Surrounding text helper ───

const SURROUNDING_MAX = 120

function _getSurrounding(content: string, offset: number): string {
  const lines = content.split('\n')
  let charCount = 0
  for (let i = 0; i < lines.length; i++) {
    const lineLen = (lines[i]?.length ?? 0) + 1 // +1 for newline
    if (charCount + lineLen > offset) {
      return (lines[i] ?? '').slice(0, SURROUNDING_MAX)
    }
    charCount += lineLen
  }
  return ''
}

function getSurroundingByLine(content: string, line: number): string {
  const lines = content.split('\n')
  const idx = line - 1
  if (idx >= 0 && idx < lines.length) {
    return (lines[idx] ?? '').slice(0, SURROUNDING_MAX)
  }
  return ''
}

// ─── Template AST Walker ───

function walkTemplate(
  node: VueTemplateNode,
  templateLineOffset: number,
  sfcContent: string,
  results: ExtractedString[],
  parentTag: string = '',
): void {
  switch (node.type) {
    case NodeTypes.TEXT: {
      // Static text between tags
      const text = typeof node.content === 'string'
        ? node.content
        : (node.loc?.source ?? '')
      const trimmed = text.trim()
      if (trimmed.length > 0 && /\S/.test(trimmed)) {
        results.push({
          value: trimmed,
          line: node.loc.start.line + templateLineOffset - 1,
          column: node.loc.start.column,
          context: 'template_text',
          scope: 'template',
          parent: parentTag,
          surrounding: getSurroundingByLine(sfcContent, node.loc.start.line + templateLineOffset - 1),
        })
      }
      break
    }

    case NodeTypes.INTERPOLATION: {
      // {{ expression }} — extract string literals from within
      if (node.content && typeof node.content !== 'string' && node.content.type === NodeTypes.SIMPLE_EXPRESSION) {
        const expr = typeof node.content.content === 'string'
          ? node.content.content
          : ''
        // Only extract if the expression itself is a string literal
        // e.g., {{ 'Hello' }} or {{ "World" }}
        const stringMatch = expr.match(/^(['"`])(.+)\1$/)
        if (stringMatch?.[2]) {
          results.push({
            value: stringMatch[2],
            line: node.loc.start.line + templateLineOffset - 1,
            column: node.loc.start.column,
            context: 'template_text',
            scope: 'template',
            parent: parentTag,
            surrounding: getSurroundingByLine(sfcContent, node.loc.start.line + templateLineOffset - 1),
          })
        }
        // If it's a variable reference like {{ greeting }}, skip — that's code
      }
      break
    }

    case NodeTypes.ELEMENT: {
      const tag = node.tag ?? ''

      // Process props/attributes
      if (node.props) {
        for (const prop of node.props) {
          processProp(prop, tag, templateLineOffset, sfcContent, results)
        }
      }

      // Recurse into children
      if (node.children) {
        for (const child of node.children) {
          walkTemplate(child, templateLineOffset, sfcContent, results, tag)
        }
      }
      break
    }

    case NodeTypes.IF: {
      // v-if creates branches — walk each branch's children
      if (node.branches) {
        for (const branch of node.branches) {
          if (branch.children) {
            for (const child of branch.children) {
              walkTemplate(child, templateLineOffset, sfcContent, results, parentTag)
            }
          }
        }
      }
      break
    }

    case NodeTypes.IF_BRANCH: {
      // Walk children of if branch
      if (node.children) {
        for (const child of node.children) {
          walkTemplate(child, templateLineOffset, sfcContent, results, parentTag)
        }
      }
      break
    }

    case NodeTypes.FOR: {
      // v-for node — walk children
      if (node.children) {
        for (const child of node.children) {
          walkTemplate(child, templateLineOffset, sfcContent, results, parentTag)
        }
      }
      break
    }

    case NodeTypes.ROOT: {
      // Root node — walk children
      if (node.children) {
        for (const child of node.children) {
          walkTemplate(child, templateLineOffset, sfcContent, results, parentTag)
        }
      }
      break
    }

    case NodeTypes.COMPOUND_EXPRESSION: {
      // Compound expression — walk children
      if (node.children) {
        for (const child of node.children) {
          if (typeof child !== 'string') {
            walkTemplate(child, templateLineOffset, sfcContent, results, parentTag)
          }
        }
      }
      break
    }

    case NodeTypes.TEXT_CALL: {
      // Text call node (wrapper for text in v-if, etc.) — walk content
      if (node.content && typeof node.content !== 'string') {
        walkTemplate(node.content, templateLineOffset, sfcContent, results, parentTag)
      }
      // Also walk children
      if (node.children) {
        for (const child of node.children) {
          walkTemplate(child, templateLineOffset, sfcContent, results, parentTag)
        }
      }
      break
    }

    default: {
      // For any unknown node type, try to walk children
      if (node.children) {
        for (const child of node.children) {
          walkTemplate(child, templateLineOffset, sfcContent, results, parentTag)
        }
      }
      break
    }
  }
}

function processProp(
  prop: VueTemplateProp,
  parentTag: string,
  templateLineOffset: number,
  sfcContent: string,
  results: ExtractedString[],
): void {
  if (prop.type === NodeTypes.ATTRIBUTE) {
    // Static attribute: title="Hello"
    if (!prop.value) return

    const attrName = prop.name
    const attrValue = prop.value.content

    if (!attrValue || attrValue.trim().length === 0) return

    // CSS attributes get css_class context
    if (CSS_ATTRIBUTES.has(attrName)) {
      results.push({
        value: attrValue,
        line: prop.value.loc.start.line + templateLineOffset - 1,
        column: prop.value.loc.start.column,
        context: 'css_class',
        scope: 'template',
        parent: parentTag,
        parentProperty: attrName,
        surrounding: getSurroundingByLine(sfcContent, prop.value.loc.start.line + templateLineOffset - 1),
      })
      return
    }

    results.push({
      value: attrValue,
      line: prop.value.loc.start.line + templateLineOffset - 1,
      column: prop.value.loc.start.column,
      context: 'template_attribute',
      scope: 'template',
      parent: parentTag,
      parentProperty: attrName,
      surrounding: getSurroundingByLine(sfcContent, prop.value.loc.start.line + templateLineOffset - 1),
    })
  } else if (prop.type === NodeTypes.DIRECTIVE) {
    // Dynamic directive: :title="expr", v-bind:title="expr", @click="handler"
    const directiveName = prop.name // 'bind', 'on', 'if', 'for', etc.

    // Skip code directives entirely (v-if, v-for, @click, etc.)
    if (CODE_DIRECTIVES.has(directiveName)) return

    // For v-bind (:attr="expr"), check if the arg is a code binding
    if (directiveName === 'bind' && prop.arg) {
      const argName = typeof prop.arg.content === 'string' ? prop.arg.content : ''
      if (CODE_DIRECTIVE_ARGS.has(argName)) return
    }

    // Extract string literals from directive expressions
    if (prop.exp) {
      const expr = typeof prop.exp.content === 'string' ? prop.exp.content : ''
      const argName = prop.arg && typeof prop.arg.content === 'string' ? prop.arg.content : ''

      // Check if expression is a simple string literal: 'text' or "text"
      const stringMatch = expr.match(/^(['"`])(.+)\1$/)
      if (stringMatch?.[2]) {
        results.push({
          value: stringMatch[2],
          line: prop.exp.loc.start.line + templateLineOffset - 1,
          column: prop.exp.loc.start.column,
          context: 'template_attribute',
          scope: 'template',
          parent: parentTag,
          parentProperty: argName || directiveName,
          surrounding: getSurroundingByLine(sfcContent, prop.exp.loc.start.line + templateLineOffset - 1),
        })
      }
      // If it's a variable or complex expression, skip — scanner doesn't interpret code
    }
  }
}

// ─── Script Block Parsing ───

// tsx-parser is being built in parallel; define the interface we expect
type TsxParserFn = (content: string, fileName: string) => ExtractedString[]

let _tsxParser: TsxParserFn | null = null

async function loadTsxParser(): Promise<TsxParserFn | null> {
  if (_tsxParser) return _tsxParser
  try {
    const mod = await import('./tsx-parser.js')
    _tsxParser = mod.parseTsx
    return _tsxParser
  } catch {
    // tsx-parser not yet available — fall back to no script parsing
    return null
  }
}

/**
 * Map script block lang to a file extension that tsx-parser's getScriptKind understands.
 * Without this, .vue files default to ScriptKind.JS — causing TypeScript type annotations
 * (e.g. defineEmits<{ 'update:modelValue': [...] }>) to be misclassified as object literals.
 */
function resolveScriptFileName(vueFileName: string, lang?: string): string {
  if (lang === 'tsx') return vueFileName.replace(/\.vue$/, '.tsx')
  if (lang === 'ts') return vueFileName.replace(/\.vue$/, '.ts')
  if (lang === 'jsx') return vueFileName.replace(/\.vue$/, '.jsx')
  return vueFileName.replace(/\.vue$/, '.js')
}

function parseScriptBlock(
  scriptContent: string,
  scriptStartLine: number,
  fileName: string,
  parseTsx: TsxParserFn,
  lang?: string,
): ExtractedString[] {
  // Resolve filename with correct extension for TypeScript parser
  const resolvedFileName = resolveScriptFileName(fileName, lang)
  const scriptResults = parseTsx(scriptContent, resolvedFileName)

  // Adjust line numbers by script block offset
  return scriptResults.map(r => {
    r.line = r.line + scriptStartLine - 1
    r.scope = 'script'
    return r
  })
}

// ─── Main Export ───

export async function parseVue(content: string, fileName: string): Promise<ExtractedString[]> {
  const compiler = await loadCompiler()
  const results: ExtractedString[] = []

  const { descriptor } = compiler.parse(content, { filename: fileName })

  // ─── Template Block ───
  if (descriptor.template) {
    const templateLineOffset = descriptor.template.loc.start.line
    const templateAst = descriptor.template.ast

    if (templateAst) {
      walkTemplate(templateAst, templateLineOffset, content, results)
    } else {
      // Fallback: compile template to get AST
      try {
        const compiled = compiler.compileTemplate({
          source: descriptor.template.content,
          filename: fileName,
          id: 'ast-scanner',
        })
        if (compiled.ast) {
          walkTemplate(compiled.ast, templateLineOffset, content, results)
        }
      } catch {
        // If template compilation fails, we skip template extraction
        // This is acceptable — malformed templates shouldn't block scanning
      }
    }
  }

  // ─── Script Block ───
  const scriptBlock = descriptor.scriptSetup ?? descriptor.script
  if (scriptBlock) {
    const parseTsx = await loadTsxParser()
    if (parseTsx) {
      const scriptStartLine = scriptBlock.loc.start.line
      const scriptResults = parseScriptBlock(
        scriptBlock.content,
        scriptStartLine,
        fileName,
        parseTsx,
        scriptBlock.lang,
      )
      results.push(...scriptResults)
    }
  }

  // Style blocks are intentionally skipped — no content strings in CSS

  return results
}

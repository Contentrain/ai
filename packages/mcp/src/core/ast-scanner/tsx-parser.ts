import ts from 'typescript'
import type { ExtractedString, StructuralContext } from './types.js'

// ─── Constants ───

const SURROUNDING_MAX = 120

// ─── Public API ───

/**
 * Parse a TSX/JSX/TS/JS file and extract all string literals with structural context.
 *
 * Uses TypeScript's syntax-only parser (no type checking, no tsconfig needed).
 * Walks the AST and classifies each string by its parent chain.
 */
export function parseTsx(content: string, fileName: string): ExtractedString[] {
  const scriptKind = getScriptKind(fileName)
  const sourceFile = ts.createSourceFile(
    fileName,
    content,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    scriptKind,
  )

  const results: ExtractedString[] = []
  const lines = content.split('\n')

  visit(sourceFile, sourceFile, lines, results)

  return results
}

// ─── Script kind detection ───

function getScriptKind(fileName: string): ts.ScriptKind {
  const lower = fileName.toLowerCase()
  if (lower.endsWith('.tsx')) return ts.ScriptKind.TSX
  if (lower.endsWith('.jsx')) return ts.ScriptKind.JSX
  if (lower.endsWith('.ts')) return ts.ScriptKind.TS
  return ts.ScriptKind.JS
}

// ─── AST Walker ───

function visit(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  lines: string[],
  results: ExtractedString[],
): void {
  // Handle JsxText nodes
  if (ts.isJsxText(node)) {
    const text = node.text.trim()
    // Skip whitespace-only or empty JsxText
    if (text.length > 0) {
      const { line: lineIdx, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
      const parent = getJsxParentTag(node)
      results.push({
        value: text,
        line: lineIdx + 1,
        column: character + 1,
        context: 'jsx_text',
        scope: 'script',
        parent,
        surrounding: buildSurrounding(lines, lineIdx),
      })
    }
    return
  }

  // Handle string literals
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    const value = node.text
    // Skip empty strings
    if (value.length === 0) return

    const { line: lineIdx, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
    const classification = classifyByParentChain(node, sourceFile)

    results.push({
      value,
      line: lineIdx + 1,
      column: character + 1,
      context: classification.context,
      scope: 'script',
      parent: classification.parent,
      parentProperty: classification.parentProperty,
      surrounding: buildSurrounding(lines, lineIdx),
    })
    return
  }

  // Handle template literals with expressions — extract static head/spans
  if (ts.isTemplateExpression(node)) {
    extractTemplateParts(node, sourceFile, lines, results)
    return
  }

  ts.forEachChild(node, (child) => {
    visit(child, sourceFile, lines, results)
  })
}

// ─── Template literal parts extraction ───

function extractTemplateParts(
  node: ts.TemplateExpression,
  sourceFile: ts.SourceFile,
  lines: string[],
  results: ExtractedString[],
): void {
  const classification = classifyByParentChain(node, sourceFile)

  // Head: text before first ${...}
  const headText = node.head.text
  if (headText.length > 0) {
    const { line: lineIdx, character } = sourceFile.getLineAndCharacterOfPosition(node.head.getStart(sourceFile))
    results.push({
      value: headText,
      line: lineIdx + 1,
      column: character + 1,
      context: classification.context,
      scope: 'script',
      parent: classification.parent,
      parentProperty: classification.parentProperty,
      surrounding: buildSurrounding(lines, lineIdx),
    })
  }

  // Template spans: text after each ${...} expression
  for (const span of node.templateSpans) {
    const spanText = span.literal.text
    if (spanText.length > 0) {
      const { line: lineIdx, character } = sourceFile.getLineAndCharacterOfPosition(span.literal.getStart(sourceFile))
      results.push({
        value: spanText,
        line: lineIdx + 1,
        column: character + 1,
        context: classification.context,
        scope: 'script',
        parent: classification.parent,
        parentProperty: classification.parentProperty,
        surrounding: buildSurrounding(lines, lineIdx),
      })
    }

    // Visit the expression inside ${...} for nested strings
    visit(span.expression, sourceFile, lines, results)
  }
}

// ─── Parent chain classification ───

interface Classification {
  context: StructuralContext
  parent: string
  parentProperty?: string
}

function classifyByParentChain(node: ts.Node, sourceFile: ts.SourceFile): Classification {
  let current = node.parent

  while (current) {
    // Import / Export declaration → import_path
    if (ts.isImportDeclaration(current) || ts.isExportDeclaration(current)) {
      return { context: 'import_path', parent: 'import' }
    }

    // Import specifier module path (dynamic import)
    if (ts.isCallExpression(current) && current.expression.kind === ts.SyntaxKind.ImportKeyword) {
      return { context: 'import_path', parent: 'import' }
    }

    // require() calls
    if (
      ts.isCallExpression(current)
      && ts.isIdentifier(current.expression)
      && current.expression.text === 'require'
    ) {
      return { context: 'import_path', parent: 'require' }
    }

    // JSX attribute → jsx_attribute or css_class
    if (ts.isJsxAttribute(current)) {
      const attrName = ts.isIdentifier(current.name) ? current.name.text : current.name.getText(sourceFile)
      // className / class / style → CSS, not content
      if (attrName === 'className' || attrName === 'class' || attrName === 'style') {
        return { context: 'css_class', parent: attrName }
      }
      return { context: 'jsx_attribute', parent: attrName, parentProperty: attrName }
    }

    // Variable declaration → variable_assignment
    if (ts.isVariableDeclaration(current)) {
      const varName = ts.isIdentifier(current.name) ? current.name.text : current.name.getText(sourceFile)
      return { context: 'variable_assignment', parent: varName }
    }

    // Property assignment → object_property
    if (ts.isPropertyAssignment(current)) {
      const key = ts.isIdentifier(current.name)
        ? current.name.text
        : ts.isStringLiteral(current.name)
          ? current.name.text
          : current.name.getText(sourceFile)
      return { context: 'object_property', parent: key, parentProperty: key }
    }

    // Enum member → enum_value
    if (ts.isEnumMember(current)) {
      const enumName = ts.isIdentifier(current.name) ? current.name.text : current.name.getText(sourceFile)
      return { context: 'enum_value', parent: enumName }
    }

    // Call expression → function_argument or css_utility_call or console_call or test_assertion
    if (ts.isCallExpression(current)) {
      const callee = getCalleeName(current.expression, sourceFile)
      // CSS utility functions
      if (['cn', 'clsx', 'classNames', 'twMerge', 'twJoin', 'cva', 'cx'].includes(callee)) {
        return { context: 'css_utility_call', parent: callee }
      }
      // Console calls
      if (callee.startsWith('console.')) {
        return { context: 'console_call', parent: callee }
      }
      // Test assertions
      if (['describe', 'it', 'test', 'expect', 'beforeEach', 'afterEach', 'beforeAll', 'afterAll'].includes(callee)) {
        return { context: 'test_assertion', parent: callee }
      }
      return { context: 'function_argument', parent: callee }
    }

    // Array literal → array_element
    if (ts.isArrayLiteralExpression(current)) {
      return { context: 'array_element', parent: 'array' }
    }

    // Case clause → switch_case
    if (ts.isCaseClause(current)) {
      return { context: 'switch_case', parent: 'case' }
    }

    // Type contexts → type_annotation
    if (
      ts.isTypeAliasDeclaration(current)
      || ts.isTypeReferenceNode(current)
      || ts.isInterfaceDeclaration(current)
      || ts.isTypeLiteralNode(current)
      || ts.isLiteralTypeNode(current)
      || ts.isUnionTypeNode(current)
      || ts.isIntersectionTypeNode(current)
    ) {
      return { context: 'type_annotation', parent: 'type' }
    }

    // Property declaration with type context (e.g., `as const` typed properties)
    // Check if we're inside a type annotation specifically
    if (ts.isPropertySignature(current)) {
      return { context: 'type_annotation', parent: 'type' }
    }

    current = current.parent
  }

  return { context: 'other', parent: '' }
}

// ─── Callee name extraction ───

function getCalleeName(expr: ts.Expression, sourceFile: ts.SourceFile): string {
  if (ts.isIdentifier(expr)) {
    return expr.text
  }
  if (ts.isPropertyAccessExpression(expr)) {
    // e.g., console.log → "console.log"
    const obj = getCalleeName(expr.expression, sourceFile)
    return obj ? `${obj}.${expr.name.text}` : expr.name.text
  }
  return expr.getText(sourceFile)
}

// ─── JSX parent tag extraction ───

function getJsxParentTag(node: ts.Node): string {
  let current = node.parent

  while (current) {
    if (ts.isJsxElement(current)) {
      const tagName = current.openingElement.tagName.getText()
      return tagName
    }
    if (ts.isJsxFragment(current)) {
      return 'Fragment'
    }
    current = current.parent
  }

  return ''
}

// ─── Surrounding code builder ───

function buildSurrounding(lines: string[], lineIdx: number): string {
  const start = Math.max(0, lineIdx - 1)
  const end = Math.min(lines.length - 1, lineIdx + 1)

  const parts: string[] = []
  for (let i = start; i <= end; i++) {
    const line = lines[i]
    if (line !== undefined) {
      parts.push(line)
    }
  }

  const joined = parts.join('\n')
  if (joined.length > SURROUNDING_MAX) {
    return joined.slice(0, SURROUNDING_MAX)
  }
  return joined
}

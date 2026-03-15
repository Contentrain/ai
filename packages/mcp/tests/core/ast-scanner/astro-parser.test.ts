import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ExtractedString } from '../../../src/core/ast-scanner/types.js'

// ─── AST Node Helpers (Astro AST shape) ───

function createRoot(children: object[]): object {
  return { type: 'root', children }
}

function createTextNode(value: string, line: number, column: number): object {
  return {
    type: 'text',
    value,
    position: {
      start: { line, column, offset: 0 },
    },
  }
}

function createElementNode(
  name: string,
  attributes: object[],
  children: object[],
  line: number,
  column: number,
): object {
  return {
    type: 'element',
    name,
    attributes,
    children,
    position: {
      start: { line, column, offset: 0 },
    },
  }
}

function createComponentNode(
  name: string,
  attributes: object[],
  children: object[],
  line: number,
  column: number,
): object {
  return {
    type: 'component',
    name,
    attributes,
    children,
    position: {
      start: { line, column, offset: 0 },
    },
  }
}

function createFrontmatter(value: string, line: number, column: number): object {
  return {
    type: 'frontmatter',
    value,
    position: {
      start: { line, column, offset: 0 },
    },
  }
}

function createAttribute(
  name: string,
  value: string,
  type: string = 'attribute',
  line: number = 1,
  column: number = 1,
): object {
  return {
    name,
    type,
    kind: 'quoted',
    value,
    position: {
      start: { line, column, offset: 0 },
    },
  }
}

function createExpressionAttribute(
  name: string,
  line: number = 1,
  column: number = 1,
): object {
  return {
    name,
    type: 'expression',
    kind: 'expression',
    value: '',
    position: {
      start: { line, column, offset: 0 },
    },
  }
}

function createSpreadAttribute(line: number = 1, column: number = 1): object {
  return {
    name: '',
    type: 'spread',
    kind: 'spread',
    value: '',
    position: {
      start: { line, column, offset: 0 },
    },
  }
}

function createExpressionNode(children: object[], line: number, column: number): object {
  return {
    type: 'expression',
    children,
    position: {
      start: { line, column, offset: 0 },
    },
  }
}

// ─── Mock state ───

let currentAst: object

const mockParseTsx = vi.fn<(content: string, fileName: string) => ExtractedString[]>()

vi.mock('@astrojs/compiler', () => ({
  parse: async () => ({ ast: currentAst }),
}))

vi.mock('../../../src/core/ast-scanner/tsx-parser.js', () => ({
  parseTsx: (...args: [string, string]) => mockParseTsx(...args),
}))

// ─── Sample Astro content ───

const ASTRO_CONTENT = `---
import Layout from '../layouts/Layout.astro'
const title = 'My Page'
const config = { description: 'Page description', type: 'page' }
---

<Layout>
  <h1>Welcome to Astro</h1>
  <p>{title}</p>
  <input placeholder="Enter your name" />
  <button title="Click to submit">Submit</button>
  <div class="flex items-center">Styled content</div>
  <a href="/about">About us</a>
</Layout>`

// ─── Tests ───

describe('astro-parser', () => {
  beforeEach(() => {
    mockParseTsx.mockReset()
    mockParseTsx.mockReturnValue([
      {
        value: 'My Page',
        line: 2,
        column: 16,
        context: 'variable_assignment',
        scope: 'script' as const,
        parent: 'title',
        surrounding: "const title = 'My Page'",
      },
      {
        value: 'Page description',
        line: 3,
        column: 26,
        context: 'object_property',
        scope: 'script' as const,
        parent: 'description',
        parentProperty: 'description',
        surrounding: "const config = { description: 'Page description', type: 'page' }",
      },
      {
        value: 'page',
        line: 3,
        column: 52,
        context: 'object_property',
        scope: 'script' as const,
        parent: 'type',
        parentProperty: 'type',
        surrounding: "const config = { description: 'Page description', type: 'page' }",
      },
    ])

    // Build standard AST
    currentAst = createRoot([
      createFrontmatter(
        "\nimport Layout from '../layouts/Layout.astro'\nconst title = 'My Page'\nconst config = { description: 'Page description', type: 'page' }\n",
        1,
        1,
      ),
      createComponentNode('Layout', [], [
        createElementNode('h1', [], [
          createTextNode('Welcome to Astro', 8, 7),
        ], 8, 3),
        createElementNode('p', [], [
          createExpressionNode([], 9, 6),
        ], 9, 3),
        createElementNode('input', [
          createAttribute('placeholder', 'Enter your name', 'attribute', 10, 10),
        ], [], 10, 3),
        createElementNode('button', [
          createAttribute('title', 'Click to submit', 'attribute', 11, 11),
        ], [
          createTextNode('Submit', 11, 35),
        ], 11, 3),
        createElementNode('div', [
          createAttribute('class', 'flex items-center', 'attribute', 12, 8),
        ], [
          createTextNode('Styled content', 12, 31),
        ], 12, 3),
        createElementNode('a', [
          createAttribute('href', '/about', 'attribute', 13, 6),
        ], [
          createTextNode('About us', 13, 20),
        ], 13, 3),
      ], 7, 1),
    ])
  })

  it('should extract template text nodes with correct context', async () => {
    const { parseAstro } = await import('../../../src/core/ast-scanner/astro-parser.js')
    const results = await parseAstro(ASTRO_CONTENT, 'index.astro')

    const templateTexts = results.filter(
      r => r.scope === 'template' && r.context === 'template_text',
    )
    const values = templateTexts.map(r => r.value)

    expect(values).toContain('Welcome to Astro')
    expect(values).toContain('Submit')
    expect(values).toContain('Styled content')
    expect(values).toContain('About us')
  })

  it('should set parent to the correct element tag name', async () => {
    const { parseAstro } = await import('../../../src/core/ast-scanner/astro-parser.js')
    const results = await parseAstro(ASTRO_CONTENT, 'index.astro')

    const welcome = results.find(r => r.value === 'Welcome to Astro')
    expect(welcome).toBeDefined()
    expect(welcome!.parent).toBe('h1')

    const submit = results.find(r => r.value === 'Submit')
    expect(submit).toBeDefined()
    expect(submit!.parent).toBe('button')

    const about = results.find(r => r.value === 'About us')
    expect(about).toBeDefined()
    expect(about!.parent).toBe('a')
  })

  it('should extract attribute values with parentProperty', async () => {
    const { parseAstro } = await import('../../../src/core/ast-scanner/astro-parser.js')
    const results = await parseAstro(ASTRO_CONTENT, 'index.astro')

    const placeholder = results.find(r => r.value === 'Enter your name')
    expect(placeholder).toBeDefined()
    expect(placeholder!.context).toBe('template_attribute')
    expect(placeholder!.parent).toBe('input')
    expect(placeholder!.parentProperty).toBe('placeholder')

    const title = results.find(r => r.value === 'Click to submit')
    expect(title).toBeDefined()
    expect(title!.context).toBe('template_attribute')
    expect(title!.parent).toBe('button')
    expect(title!.parentProperty).toBe('title')
  })

  it('should mark class attribute values with css_class context', async () => {
    const { parseAstro } = await import('../../../src/core/ast-scanner/astro-parser.js')
    const results = await parseAstro(ASTRO_CONTENT, 'index.astro')

    const classAttr = results.find(r => r.value === 'flex items-center')
    expect(classAttr).toBeDefined()
    expect(classAttr!.context).toBe('css_class')
    expect(classAttr!.parentProperty).toBe('class')
  })

  it('should extract href attribute values as template_attribute', async () => {
    const { parseAstro } = await import('../../../src/core/ast-scanner/astro-parser.js')
    const results = await parseAstro(ASTRO_CONTENT, 'index.astro')

    const href = results.find(r => r.value === '/about')
    expect(href).toBeDefined()
    expect(href!.context).toBe('template_attribute')
    expect(href!.parentProperty).toBe('href')
  })

  it('should delegate frontmatter to tsx-parser', async () => {
    const { parseAstro } = await import('../../../src/core/ast-scanner/astro-parser.js')
    await parseAstro(ASTRO_CONTENT, 'index.astro')

    expect(mockParseTsx).toHaveBeenCalledTimes(1)
    const frontmatterContent = mockParseTsx.mock.calls[0]![0]
    expect(frontmatterContent).toContain("import Layout from '../layouts/Layout.astro'")
    expect(frontmatterContent).toContain("const title = 'My Page'")
  })

  it('should set scope: script for frontmatter strings', async () => {
    const { parseAstro } = await import('../../../src/core/ast-scanner/astro-parser.js')
    const results = await parseAstro(ASTRO_CONTENT, 'index.astro')

    const scriptResults = results.filter(r => r.scope === 'script')
    expect(scriptResults.length).toBeGreaterThan(0)

    const myPage = scriptResults.find(r => r.value === 'My Page')
    expect(myPage).toBeDefined()
    expect(myPage!.scope).toBe('script')
  })

  it('should skip JSX expression nodes', async () => {
    const { parseAstro } = await import('../../../src/core/ast-scanner/astro-parser.js')
    const results = await parseAstro(ASTRO_CONTENT, 'index.astro')

    const titleExpr = results.find(
      r => r.value === 'title' && r.scope === 'template',
    )
    expect(titleExpr).toBeUndefined()
  })

  it('should provide surrounding context string for all results', async () => {
    const { parseAstro } = await import('../../../src/core/ast-scanner/astro-parser.js')
    const results = await parseAstro(ASTRO_CONTENT, 'index.astro')

    for (const r of results) {
      expect(typeof r.surrounding).toBe('string')
    }
  })

  it('should have 1-based line and column numbers', async () => {
    const { parseAstro } = await import('../../../src/core/ast-scanner/astro-parser.js')
    const results = await parseAstro(ASTRO_CONTENT, 'index.astro')

    for (const r of results) {
      expect(r.line).toBeGreaterThanOrEqual(1)
      expect(r.column).toBeGreaterThanOrEqual(1)
    }
  })
})

describe('astro-parser edge cases', () => {
  beforeEach(() => {
    mockParseTsx.mockReset()
    mockParseTsx.mockReturnValue([])
  })

  it('should handle file without frontmatter', async () => {
    currentAst = createRoot([
      createElementNode('div', [], [
        createTextNode('Hello', 1, 6),
      ], 1, 1),
    ])

    const { parseAstro } = await import('../../../src/core/ast-scanner/astro-parser.js')
    const results = await parseAstro('<div>Hello</div>', 'NoFrontmatter.astro')

    expect(Array.isArray(results)).toBe(true)
    const hello = results.find(r => r.value === 'Hello')
    expect(hello).toBeDefined()
    expect(hello!.scope).toBe('template')
    expect(mockParseTsx).not.toHaveBeenCalled()
  })

  it('should skip whitespace-only text nodes', async () => {
    currentAst = createRoot([
      createElementNode('div', [], [
        createTextNode('   \n  \t  ', 1, 6),
        createTextNode('Real content', 2, 3),
      ], 1, 1),
    ])

    const { parseAstro } = await import('../../../src/core/ast-scanner/astro-parser.js')
    const results = await parseAstro('<div>\n  Real content\n</div>', 'Whitespace.astro')

    const whitespace = results.find(r => r.value.trim() === '')
    expect(whitespace).toBeUndefined()

    const real = results.find(r => r.value === 'Real content')
    expect(real).toBeDefined()
  })

  it('should skip expression attributes (dynamic bindings)', async () => {
    currentAst = createRoot([
      createElementNode('div', [
        createExpressionAttribute('className', 1, 6),
        createAttribute('title', 'Hello', 'attribute', 1, 30),
      ], [], 1, 1),
    ])

    const { parseAstro } = await import('../../../src/core/ast-scanner/astro-parser.js')
    const results = await parseAstro(
      '<div className={styles.container} title="Hello" />',
      'DynAttr.astro',
    )

    const title = results.find(r => r.value === 'Hello')
    expect(title).toBeDefined()
    expect(title!.context).toBe('template_attribute')
  })

  it('should skip spread attributes', async () => {
    currentAst = createRoot([
      createElementNode('div', [
        createSpreadAttribute(1, 6),
        createAttribute('alt', 'Image description', 'attribute', 1, 20),
      ], [], 1, 1),
    ])

    const { parseAstro } = await import('../../../src/core/ast-scanner/astro-parser.js')
    const results = await parseAstro(
      '<div {...props} alt="Image description" />',
      'Spread.astro',
    )

    const alt = results.find(r => r.value === 'Image description')
    expect(alt).toBeDefined()
    expect(alt!.context).toBe('template_attribute')
  })

  it('should handle component nodes like element nodes', async () => {
    currentAst = createRoot([
      createComponentNode('Header', [
        createAttribute('title', 'My Site', 'attribute', 1, 10),
      ], [
        createTextNode('Welcome', 2, 3),
      ], 1, 1),
    ])

    const { parseAstro } = await import('../../../src/core/ast-scanner/astro-parser.js')
    const results = await parseAstro(
      '<Header title="My Site">\n  Welcome\n</Header>',
      'Component.astro',
    )

    const title = results.find(r => r.value === 'My Site')
    expect(title).toBeDefined()
    expect(title!.parent).toBe('Header')

    const welcome = results.find(r => r.value === 'Welcome')
    expect(welcome).toBeDefined()
    expect(welcome!.parent).toBe('Header')
  })

  it('should return ExtractedString shape for all results', async () => {
    currentAst = createRoot([
      createElementNode('p', [], [
        createTextNode('Hello there', 1, 4),
      ], 1, 1),
    ])

    const { parseAstro } = await import('../../../src/core/ast-scanner/astro-parser.js')
    const results = await parseAstro('<p>Hello there</p>', 'Shape.astro')

    expect(results.length).toBeGreaterThan(0)
    const first = results[0]!
    expect(first).toHaveProperty('value')
    expect(first).toHaveProperty('line')
    expect(first).toHaveProperty('column')
    expect(first).toHaveProperty('context')
    expect(first).toHaveProperty('scope')
    expect(first).toHaveProperty('parent')
    expect(first).toHaveProperty('surrounding')

    expect(typeof first.value).toBe('string')
    expect(typeof first.line).toBe('number')
    expect(typeof first.column).toBe('number')
    expect(typeof first.context).toBe('string')
    expect(typeof first.scope).toBe('string')
    expect(typeof first.parent).toBe('string')
    expect(typeof first.surrounding).toBe('string')
  })

  it('should handle empty frontmatter', async () => {
    currentAst = createRoot([
      createFrontmatter('  \n  ', 1, 1),
      createElementNode('h1', [], [
        createTextNode('Hello', 4, 5),
      ], 4, 1),
    ])

    const { parseAstro } = await import('../../../src/core/ast-scanner/astro-parser.js')
    const results = await parseAstro('---\n  \n---\n<h1>Hello</h1>', 'Empty.astro')

    const hello = results.find(r => r.value === 'Hello')
    expect(hello).toBeDefined()
    expect(mockParseTsx).not.toHaveBeenCalled()
  })

  it('should skip comment and doctype nodes', async () => {
    currentAst = createRoot([
      { type: 'doctype' },
      { type: 'comment', value: 'This is a comment' },
      createElementNode('p', [], [
        createTextNode('Content', 3, 4),
      ], 3, 1),
    ])

    const { parseAstro } = await import('../../../src/core/ast-scanner/astro-parser.js')
    const results = await parseAstro(
      '<!DOCTYPE html>\n<!-- This is a comment -->\n<p>Content</p>',
      'Comment.astro',
    )

    const comment = results.find(r => r.value === 'This is a comment')
    expect(comment).toBeUndefined()

    const content = results.find(r => r.value === 'Content')
    expect(content).toBeDefined()
  })
})

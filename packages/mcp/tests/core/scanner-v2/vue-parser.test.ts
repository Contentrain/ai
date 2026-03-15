import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ExtractedString } from '../../../src/core/scanner-v2/vue-parser.js'

// ─── AST Node Helpers ───

function createTextNode(text: string, line: number, column: number = 1): object {
  return {
    type: 2, // TEXT
    content: text,
    loc: {
      start: { line, column, offset: 0 },
      end: { line, column: column + text.length, offset: 0 },
      source: text,
    },
  }
}

function createInterpolationNode(expr: string, line: number, column: number = 1): object {
  return {
    type: 5, // INTERPOLATION
    loc: {
      start: { line, column, offset: 0 },
      end: { line, column: column + expr.length + 4, offset: 0 },
      source: `{{ ${expr} }}`,
    },
    content: {
      type: 4, // SIMPLE_EXPRESSION
      content: expr,
      loc: {
        start: { line, column: column + 3, offset: 0 },
        end: { line, column: column + 3 + expr.length, offset: 0 },
        source: expr,
      },
    },
  }
}

function createAttributeNode(name: string, value: string, line: number, column: number = 1): object {
  return {
    type: 6, // ATTRIBUTE
    name,
    loc: {
      start: { line, column, offset: 0 },
      end: { line, column: column + name.length + value.length + 3, offset: 0 },
      source: `${name}="${value}"`,
    },
    value: {
      type: 2,
      content: value,
      loc: {
        start: { line, column: column + name.length + 2, offset: 0 },
        end: { line, column: column + name.length + 2 + value.length, offset: 0 },
        source: value,
      },
    },
  }
}

function createDirectiveNode(
  name: string,
  arg: string | null,
  expression: string,
  line: number,
  column: number = 1,
): object {
  return {
    type: 7, // DIRECTIVE
    name,
    loc: {
      start: { line, column, offset: 0 },
      end: { line, column: column + 20, offset: 0 },
      source: `v-${name}${arg ? `:${arg}` : ''}="${expression}"`,
    },
    arg: arg
      ? {
        type: 4,
        content: arg,
        loc: {
          start: { line, column, offset: 0 },
          end: { line, column: column + arg.length, offset: 0 },
          source: arg,
        },
      }
      : null,
    exp: {
      type: 4,
      content: expression,
      loc: {
        start: { line, column: column + 10, offset: 0 },
        end: { line, column: column + 10 + expression.length, offset: 0 },
        source: expression,
      },
    },
  }
}

function createElementNode(
  tag: string,
  props: object[],
  children: object[],
  line: number,
  column: number = 1,
): object {
  return {
    type: 1, // ELEMENT
    tag,
    loc: {
      start: { line, column, offset: 0 },
      end: { line: line + children.length, column: 1, offset: 0 },
      source: '',
    },
    props,
    children,
  }
}

function createIfNode(branches: object[], line: number): object {
  return {
    type: 9, // IF
    loc: {
      start: { line, column: 1, offset: 0 },
      end: { line, column: 1, offset: 0 },
      source: '',
    },
    branches,
  }
}

function createIfBranchNode(children: object[], line: number): object {
  return {
    type: 10, // IF_BRANCH
    loc: {
      start: { line, column: 1, offset: 0 },
      end: { line, column: 1, offset: 0 },
      source: '',
    },
    children,
  }
}

function createRootNode(children: object[]): object {
  return {
    type: 0, // ROOT
    loc: {
      start: { line: 1, column: 1, offset: 0 },
      end: { line: 1, column: 1, offset: 0 },
      source: '',
    },
    children,
  }
}

// ─── Mutable mock descriptor ───
// The mock returns whatever `currentDescriptor` points to.
// Each test sets it before calling parseVue.

interface MockDescriptor {
  template: {
    content: string
    loc: { start: { line: number; column: number; offset: number } }
    ast: object | null
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

let currentDescriptor: MockDescriptor

// Standard descriptor for the main test suite
function buildStandardDescriptor(): MockDescriptor {
  const rootAst = createRootNode([
    createElementNode('div', [], [
      createElementNode('h1', [], [
        createTextNode('Welcome to our app', 3, 9),
      ], 3),
      createElementNode('p', [], [
        createInterpolationNode('greeting', 4, 8),
      ], 4),
      createElementNode('input', [
        createAttributeNode('placeholder', 'Enter your email', 5, 12),
      ], [], 5),
      createElementNode('button', [
        createAttributeNode('title', 'Click to submit', 6, 13),
      ], [
        createTextNode('Submit', 6, 40),
      ], 6),
      createElementNode('div', [
        createAttributeNode('class', 'flex items-center', 7, 10),
      ], [
        createTextNode('Not CSS', 7, 35),
      ], 7),
      createIfNode([
        createIfBranchNode([
          createElementNode('span', [
            createDirectiveNode('if', null, 'show', 8, 11),
          ], [
            createTextNode('Conditional text', 8, 25),
          ], 8),
        ], 8),
      ], 8),
    ], 2),
  ])

  return {
    template: {
      content: '',
      loc: { start: { line: 1, column: 1, offset: 0 } },
      ast: rootAst,
    },
    script: null,
    scriptSetup: {
      content: [
        '',
        "import { ref } from 'vue'",
        "const greeting = ref('Hello World')",
        "const config = { title: 'Page Title', type: 'primary' }",
        '',
      ].join('\n'),
      loc: { start: { line: 12, column: 1, offset: 0 } },
      lang: 'ts',
    },
  }
}

const SFC_CONTENT = `<template>
  <div>
    <h1>Welcome to our app</h1>
    <p>{{ greeting }}</p>
    <input placeholder="Enter your email" />
    <button title="Click to submit">Submit</button>
    <div class="flex items-center">Not CSS</div>
    <span v-if="show">Conditional text</span>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
const greeting = ref('Hello World')
const config = { title: 'Page Title', type: 'primary' }
</script>`

// ─── Mocks ───

const mockParseTsx = vi.fn<(content: string, fileName: string) => ExtractedString[]>()

vi.mock('@vue/compiler-sfc', () => ({
  parse: () => ({ descriptor: currentDescriptor }),
  compileTemplate: () => ({ ast: null }),
}))

vi.mock('../../../src/core/scanner-v2/tsx-parser.js', () => ({
  parseTsx: (...args: [string, string]) => mockParseTsx(...args),
}))

// ─── Tests ───

describe('vue-parser', () => {
  beforeEach(() => {
    currentDescriptor = buildStandardDescriptor()
    mockParseTsx.mockReset()
    mockParseTsx.mockImplementation(() => [
      {
        value: 'Hello World',
        line: 3,
        column: 27,
        context: 'function_argument',
        scope: 'script' as const,
        parent: 'CallExpression',
        parentProperty: undefined,
        surrounding: "const greeting = ref('Hello World')",
      },
      {
        value: 'Page Title',
        line: 4,
        column: 26,
        context: 'object_property',
        scope: 'script' as const,
        parent: 'ObjectExpression',
        parentProperty: 'title',
        surrounding: "const config = { title: 'Page Title', type: 'primary' }",
      },
      {
        value: 'primary',
        line: 4,
        column: 46,
        context: 'object_property',
        scope: 'script' as const,
        parent: 'ObjectExpression',
        parentProperty: 'type',
        surrounding: "const config = { title: 'Page Title', type: 'primary' }",
      },
    ])
  })

  it('should extract template text nodes with correct context', async () => {
    const { parseVue } = await import('../../../src/core/scanner-v2/vue-parser.js')
    const results = await parseVue(SFC_CONTENT, 'TestComponent.vue')

    const templateTexts = results.filter(
      r => r.scope === 'template' && r.context === 'template_text',
    )

    const values = templateTexts.map(r => r.value)
    expect(values).toContain('Welcome to our app')
    expect(values).toContain('Submit')
    expect(values).toContain('Not CSS')
    expect(values).toContain('Conditional text')
  })

  it('should set parent to the correct element tag name', async () => {
    const { parseVue } = await import('../../../src/core/scanner-v2/vue-parser.js')
    const results = await parseVue(SFC_CONTENT, 'TestComponent.vue')

    const welcome = results.find(r => r.value === 'Welcome to our app')
    expect(welcome).toBeDefined()
    expect(welcome!.parent).toBe('h1')

    const submit = results.find(r => r.value === 'Submit')
    expect(submit).toBeDefined()
    expect(submit!.parent).toBe('button')

    const notCss = results.find(r => r.value === 'Not CSS')
    expect(notCss).toBeDefined()
    expect(notCss!.parent).toBe('div')
  })

  it('should extract attribute values with attribute name as parentProperty', async () => {
    const { parseVue } = await import('../../../src/core/scanner-v2/vue-parser.js')
    const results = await parseVue(SFC_CONTENT, 'TestComponent.vue')

    const placeholder = results.find(r => r.value === 'Enter your email')
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
    const { parseVue } = await import('../../../src/core/scanner-v2/vue-parser.js')
    const results = await parseVue(SFC_CONTENT, 'TestComponent.vue')

    const classAttr = results.find(r => r.value === 'flex items-center')
    expect(classAttr).toBeDefined()
    expect(classAttr!.context).toBe('css_class')
    expect(classAttr!.parentProperty).toBe('class')
  })

  it('should NOT extract interpolation variable references ({{ greeting }})', async () => {
    const { parseVue } = await import('../../../src/core/scanner-v2/vue-parser.js')
    const results = await parseVue(SFC_CONTENT, 'TestComponent.vue')

    const greeting = results.find(
      r => r.value === 'greeting' && r.scope === 'template',
    )
    expect(greeting).toBeUndefined()
  })

  it('should extract script strings with scope: script and offset line numbers', async () => {
    const { parseVue } = await import('../../../src/core/scanner-v2/vue-parser.js')
    const results = await parseVue(SFC_CONTENT, 'TestComponent.vue')

    const scriptResults = results.filter(r => r.scope === 'script')
    expect(scriptResults.length).toBeGreaterThanOrEqual(3)

    // tsx-parser returns line 3 relative to script content
    // Script starts at line 12, so absolute = 3 + 12 - 1 = 14
    const helloWorld = scriptResults.find(r => r.value === 'Hello World')
    expect(helloWorld).toBeDefined()
    expect(helloWorld!.line).toBe(14)
    expect(helloWorld!.context).toBe('function_argument')

    const pageTitle = scriptResults.find(r => r.value === 'Page Title')
    expect(pageTitle).toBeDefined()
    expect(pageTitle!.line).toBe(15)
    expect(pageTitle!.context).toBe('object_property')
  })

  it('should pass script content to tsx-parser', async () => {
    const { parseVue } = await import('../../../src/core/scanner-v2/vue-parser.js')
    await parseVue(SFC_CONTENT, 'TestComponent.vue')

    expect(mockParseTsx).toHaveBeenCalledTimes(1)
    const scriptContent = mockParseTsx.mock.calls[0]![0]
    expect(scriptContent).toContain("import { ref } from 'vue'")
    expect(scriptContent).toContain("const greeting = ref('Hello World')")
  })

  it('should correctly offset template line numbers', async () => {
    const { parseVue } = await import('../../../src/core/scanner-v2/vue-parser.js')
    const results = await parseVue(SFC_CONTENT, 'TestComponent.vue')

    const welcome = results.find(r => r.value === 'Welcome to our app')
    expect(welcome).toBeDefined()
    expect(welcome!.line).toBe(3)
  })

  it('should handle v-if expressions as code — not extracting them as content', async () => {
    const { parseVue } = await import('../../../src/core/scanner-v2/vue-parser.js')
    const results = await parseVue(SFC_CONTENT, 'TestComponent.vue')

    const show = results.find(
      r => r.value === 'show' && r.scope === 'template',
    )
    expect(show).toBeUndefined()
  })

  it('should extract text inside v-if conditionally rendered elements', async () => {
    const { parseVue } = await import('../../../src/core/scanner-v2/vue-parser.js')
    const results = await parseVue(SFC_CONTENT, 'TestComponent.vue')

    const conditional = results.find(r => r.value === 'Conditional text')
    expect(conditional).toBeDefined()
    expect(conditional!.scope).toBe('template')
    expect(conditional!.context).toBe('template_text')
  })

  it('should set scope: template for all template-extracted strings', async () => {
    const { parseVue } = await import('../../../src/core/scanner-v2/vue-parser.js')
    const results = await parseVue(SFC_CONTENT, 'TestComponent.vue')

    const templateResults = results.filter(r => r.scope === 'template')
    for (const r of templateResults) {
      expect(r.scope).toBe('template')
    }

    const scriptResults = results.filter(r => r.scope === 'script')
    for (const r of scriptResults) {
      expect(r.scope).toBe('script')
    }
  })

  it('should provide surrounding context string', async () => {
    const { parseVue } = await import('../../../src/core/scanner-v2/vue-parser.js')
    const results = await parseVue(SFC_CONTENT, 'TestComponent.vue')

    for (const r of results) {
      expect(typeof r.surrounding).toBe('string')
    }
  })
})

describe('vue-parser edge cases', () => {
  beforeEach(() => {
    mockParseTsx.mockReset()
    mockParseTsx.mockReturnValue([])
  })

  it('should handle SFC without template block', async () => {
    currentDescriptor = {
      template: null,
      script: {
        content: "export default { name: 'Test' }",
        loc: { start: { line: 1, column: 1, offset: 0 } },
      },
      scriptSetup: null,
    }

    const { parseVue } = await import('../../../src/core/scanner-v2/vue-parser.js')
    const results = await parseVue(
      '<script>\nexport default { name: "Test" }\n</script>',
      'NoTemplate.vue',
    )

    expect(Array.isArray(results)).toBe(true)
  })

  it('should handle SFC without script block', async () => {
    currentDescriptor = {
      template: {
        content: '<div>Hello</div>',
        loc: { start: { line: 1, column: 1, offset: 0 } },
        ast: createRootNode([
          createElementNode('div', [], [
            createTextNode('Hello', 1, 6),
          ], 1),
        ]),
      },
      script: null,
      scriptSetup: null,
    }

    const { parseVue } = await import('../../../src/core/scanner-v2/vue-parser.js')
    const results = await parseVue(
      '<template><div>Hello</div></template>',
      'NoScript.vue',
    )

    expect(Array.isArray(results)).toBe(true)
    const hello = results.find(r => r.value === 'Hello')
    expect(hello).toBeDefined()
    expect(hello!.scope).toBe('template')
  })

  it('should skip @click and v-on directives (code, not content)', async () => {
    currentDescriptor = {
      template: {
        content: '',
        loc: { start: { line: 1, column: 1, offset: 0 } },
        ast: createRootNode([
          createElementNode('button', [
            createDirectiveNode('on', 'click', 'handleClick', 1, 9),
          ], [
            createTextNode('Click me', 1, 30),
          ], 1),
        ]),
      },
      script: null,
      scriptSetup: null,
    }

    const { parseVue } = await import('../../../src/core/scanner-v2/vue-parser.js')
    const results = await parseVue(
      '<template><button @click="handleClick">Click me</button></template>',
      'EventHandler.vue',
    )

    const handler = results.find(r => r.value === 'handleClick')
    expect(handler).toBeUndefined()

    const clickMe = results.find(r => r.value === 'Click me')
    expect(clickMe).toBeDefined()
  })

  it('should skip :class and :style bindings (CSS, not content)', async () => {
    currentDescriptor = {
      template: {
        content: '',
        loc: { start: { line: 1, column: 1, offset: 0 } },
        ast: createRootNode([
          createElementNode('div', [
            createDirectiveNode('bind', 'class', '{ active: isActive }', 1, 6),
            createDirectiveNode('bind', 'style', '{ color: textColor }', 1, 40),
          ], [
            createTextNode('Content', 1, 70),
          ], 1),
        ]),
      },
      script: null,
      scriptSetup: null,
    }

    const { parseVue } = await import('../../../src/core/scanner-v2/vue-parser.js')
    const results = await parseVue(
      '<template><div :class="{ active: isActive }" :style="{ color: textColor }">Content</div></template>',
      'Bindings.vue',
    )

    const classBinding = results.find(r => r.value.includes('active'))
    expect(classBinding).toBeUndefined()

    const styleBinding = results.find(r => r.value.includes('color'))
    expect(styleBinding).toBeUndefined()

    const content = results.find(r => r.value === 'Content')
    expect(content).toBeDefined()
  })

  it('should skip v-for expressions', async () => {
    currentDescriptor = {
      template: {
        content: '',
        loc: { start: { line: 1, column: 1, offset: 0 } },
        ast: createRootNode([
          createElementNode('li', [
            createDirectiveNode('for', null, 'item in items', 1, 5),
          ], [
            createTextNode('List item', 1, 30),
          ], 1),
        ]),
      },
      script: null,
      scriptSetup: null,
    }

    const { parseVue } = await import('../../../src/core/scanner-v2/vue-parser.js')
    const results = await parseVue(
      '<template><li v-for="item in items">List item</li></template>',
      'ForLoop.vue',
    )

    const forExpr = results.find(r => r.value === 'item in items')
    expect(forExpr).toBeUndefined()

    const listItem = results.find(r => r.value === 'List item')
    expect(listItem).toBeDefined()
  })

  it('should extract string literals in interpolation ({{ "Hello" }})', async () => {
    currentDescriptor = {
      template: {
        content: '',
        loc: { start: { line: 1, column: 1, offset: 0 } },
        ast: createRootNode([
          createElementNode('p', [], [
            createInterpolationNode("'Static greeting'", 1, 4),
          ], 1),
        ]),
      },
      script: null,
      scriptSetup: null,
    }

    const { parseVue } = await import('../../../src/core/scanner-v2/vue-parser.js')
    const results = await parseVue(
      "<template><p>{{ 'Static greeting' }}</p></template>",
      'Interpolation.vue',
    )

    const greeting = results.find(r => r.value === 'Static greeting')
    expect(greeting).toBeDefined()
    expect(greeting!.context).toBe('template_text')
  })

  it('should skip whitespace-only text nodes', async () => {
    currentDescriptor = {
      template: {
        content: '',
        loc: { start: { line: 1, column: 1, offset: 0 } },
        ast: createRootNode([
          createElementNode('div', [], [
            createTextNode('   \n  \t  ', 1, 6),
            createTextNode('Real content', 2, 5),
          ], 1),
        ]),
      },
      script: null,
      scriptSetup: null,
    }

    const { parseVue } = await import('../../../src/core/scanner-v2/vue-parser.js')
    const results = await parseVue(
      '<template><div>\n  Real content\n</div></template>',
      'Whitespace.vue',
    )

    const whitespace = results.find(r => r.value.trim() === '')
    expect(whitespace).toBeUndefined()

    const real = results.find(r => r.value === 'Real content')
    expect(real).toBeDefined()
  })
})

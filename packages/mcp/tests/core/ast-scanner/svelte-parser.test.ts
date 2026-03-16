import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ExtractedString } from '../../../src/core/ast-scanner/types.js'

// ─── AST Node Helpers (Svelte AST shape) ───

function createFragment(children: object[]): object {
  return { type: 'Fragment', start: 0, end: 100, children }
}

function createTextNode(data: string, start: number, end: number): object {
  return { type: 'Text', start, end, data, raw: data }
}

function createElementNode(
  name: string,
  attributes: object[],
  children: object[],
  start: number,
  end: number,
): object {
  return { type: 'Element', name, start, end, attributes, children }
}

function createAttribute(
  name: string,
  value: { type: string; data: string; start: number; end: number }[],
  start: number,
  end: number,
): object {
  return { type: 'Attribute', name, start, end, value }
}

function createIfBlock(
  children: object[],
  elseBlock: object | undefined,
  start: number,
  end: number,
): object {
  return {
    type: 'IfBlock',
    start,
    end,
    expression: { type: 'Identifier', start, end, name: 'condition' },
    children,
    else: elseBlock,
  }
}

function createElseBlock(children: object[], start: number, end: number): object {
  return { type: 'ElseBlock', start, end, children }
}

function createEachBlock(children: object[], start: number, end: number): object {
  return {
    type: 'EachBlock',
    start,
    end,
    expression: { type: 'Identifier', start, end, name: 'items' },
    children,
  }
}

function createEventHandler(name: string, start: number, end: number): object {
  return { type: 'EventHandler', name, start, end }
}

function createBinding(name: string, start: number, end: number): object {
  return { type: 'Binding', name, start, end }
}

function createMustacheTag(start: number, end: number): object {
  return {
    type: 'MustacheTag',
    start,
    end,
    expression: { type: 'Identifier', start: start + 1, end: end - 1, name: 'value' },
  }
}

function createRawMustacheTag(start: number, end: number): object {
  return {
    type: 'RawMustacheTag',
    start,
    end,
    expression: { type: 'Identifier', start: start + 1, end: end - 1, name: 'html' },
  }
}

// ─── Mock state ───

let currentAst: {
  html: object
  instance?: { start: number; end: number }
  module?: { start: number; end: number }
  css?: object
}

// Import cache reset helper

const mockParseTsx = vi.fn<(content: string, fileName: string) => ExtractedString[]>()

vi.mock('svelte/compiler', () => ({
  parse: () => currentAst,
}))

vi.mock('../../../src/core/ast-scanner/tsx-parser.js', () => ({
  parseTsx: (...args: [string, string]) => mockParseTsx(...args),
}))

// ─── Sample Svelte content ───

const SVELTE_CONTENT = `<script>
  import { onMount } from 'svelte'
  let greeting = 'Hello World'
  const config = { title: 'Page Title', type: 'primary' }
</script>

<main>
  <h1>Welcome to Svelte</h1>
  <p>{greeting}</p>
  <input placeholder="Enter your email" />
  <button title="Click to submit" on:click={handleClick}>Submit</button>
  <div class="flex items-center">Styled content</div>
  {#if show}
    <span>Conditional text</span>
  {:else}
    <span>Fallback text</span>
  {/if}
  {#each items as item}
    <li>List item</li>
  {/each}
  {@html rawContent}
</main>

<style>
  h1 { color: red; }
</style>`

// ─── Tests ───

describe('svelte-parser', () => {
  beforeEach(() => {
    mockParseTsx.mockReset()
    mockParseTsx.mockReturnValue([
      {
        value: 'Hello World',
        line: 3,
        column: 20,
        context: 'variable_assignment',
        scope: 'script' as const,
        parent: 'greeting',
        surrounding: "let greeting = 'Hello World'",
      },
      {
        value: 'Page Title',
        line: 4,
        column: 26,
        context: 'object_property',
        scope: 'script' as const,
        parent: 'title',
        parentProperty: 'title',
        surrounding: "const config = { title: 'Page Title', type: 'primary' }",
      },
      {
        value: 'primary',
        line: 4,
        column: 46,
        context: 'object_property',
        scope: 'script' as const,
        parent: 'type',
        parentProperty: 'type',
        surrounding: "const config = { title: 'Page Title', type: 'primary' }",
      },
    ])

    // Build standard AST
    currentAst = {
      html: createFragment([
        createElementNode('main', [], [
          createElementNode('h1', [], [
            createTextNode('Welcome to Svelte', 93, 110),
          ], 89, 115),
          createElementNode('p', [], [
            createMustacheTag(120, 130),
          ], 117, 134),
          createElementNode('input', [
            createAttribute('placeholder', [
              { type: 'Text', data: 'Enter your email', start: 153, end: 169 },
            ], 140, 170),
          ], [], 134, 173),
          createElementNode('button', [
            createAttribute('title', [
              { type: 'Text', data: 'Click to submit', start: 188, end: 203 },
            ], 181, 204),
            createEventHandler('click', 205, 230),
          ], [
            createTextNode('Submit', 231, 237),
          ], 173, 246),
          createElementNode('div', [
            createAttribute('class', [
              { type: 'Text', data: 'flex items-center', start: 258, end: 275 },
            ], 251, 276),
          ], [
            createTextNode('Styled content', 277, 291),
          ], 246, 297),
          createIfBlock([
            createElementNode('span', [], [
              createTextNode('Conditional text', 320, 336),
            ], 314, 343),
          ], createElseBlock([
            createElementNode('span', [], [
              createTextNode('Fallback text', 370, 383),
            ], 364, 390),
          ], 350, 400), 298, 410),
          createEachBlock([
            createElementNode('li', [], [
              createTextNode('List item', 440, 449),
            ], 436, 454),
          ], 411, 465),
          createRawMustacheTag(466, 485),
        ], 83, 492),
      ]),
      instance: {
        start: 0,
        end: 82,
      },
    }
  })

  it('should extract template text nodes with correct context', async () => {
    const { parseSvelte } = await import('../../../src/core/ast-scanner/svelte-parser.js')
    const results = await parseSvelte(SVELTE_CONTENT, 'App.svelte')

    const templateTexts = results.filter(
      r => r.scope === 'template' && r.context === 'template_text',
    )
    const values = templateTexts.map(r => r.value)

    expect(values).toContain('Welcome to Svelte')
    expect(values).toContain('Submit')
    expect(values).toContain('Styled content')
    expect(values).toContain('Conditional text')
    expect(values).toContain('Fallback text')
    expect(values).toContain('List item')
  })

  it('should set parent to the correct element tag name', async () => {
    const { parseSvelte } = await import('../../../src/core/ast-scanner/svelte-parser.js')
    const results = await parseSvelte(SVELTE_CONTENT, 'App.svelte')

    const welcome = results.find(r => r.value === 'Welcome to Svelte')
    expect(welcome).toBeDefined()
    expect(welcome!.parent).toBe('h1')

    const submit = results.find(r => r.value === 'Submit')
    expect(submit).toBeDefined()
    expect(submit!.parent).toBe('button')
  })

  it('should extract attribute values with parentProperty', async () => {
    const { parseSvelte } = await import('../../../src/core/ast-scanner/svelte-parser.js')
    const results = await parseSvelte(SVELTE_CONTENT, 'App.svelte')

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
    const { parseSvelte } = await import('../../../src/core/ast-scanner/svelte-parser.js')
    const results = await parseSvelte(SVELTE_CONTENT, 'App.svelte')

    const classAttr = results.find(r => r.value === 'flex items-center')
    expect(classAttr).toBeDefined()
    expect(classAttr!.context).toBe('css_class')
    expect(classAttr!.parentProperty).toBe('class')
  })

  it('should skip on:click event handlers (code, not content)', async () => {
    const { parseSvelte } = await import('../../../src/core/ast-scanner/svelte-parser.js')
    const results = await parseSvelte(SVELTE_CONTENT, 'App.svelte')

    const handler = results.find(r => r.value === 'handleClick')
    expect(handler).toBeUndefined()
  })

  it('should skip {expression} mustache tags (code)', async () => {
    const { parseSvelte } = await import('../../../src/core/ast-scanner/svelte-parser.js')
    const results = await parseSvelte(SVELTE_CONTENT, 'App.svelte')

    const greeting = results.find(
      r => r.value === 'greeting' && r.scope === 'template',
    )
    expect(greeting).toBeUndefined()
  })

  it('should skip {@html} raw mustache tags (code)', async () => {
    const { parseSvelte } = await import('../../../src/core/ast-scanner/svelte-parser.js')
    const results = await parseSvelte(SVELTE_CONTENT, 'App.svelte')

    const rawContent = results.find(
      r => r.value === 'rawContent' && r.scope === 'template',
    )
    expect(rawContent).toBeUndefined()
  })

  it('should extract text inside {#if} blocks', async () => {
    const { parseSvelte } = await import('../../../src/core/ast-scanner/svelte-parser.js')
    const results = await parseSvelte(SVELTE_CONTENT, 'App.svelte')

    const conditional = results.find(r => r.value === 'Conditional text')
    expect(conditional).toBeDefined()
    expect(conditional!.context).toBe('template_text')
    expect(conditional!.scope).toBe('template')
  })

  it('should extract text inside {:else} blocks', async () => {
    const { parseSvelte } = await import('../../../src/core/ast-scanner/svelte-parser.js')
    const results = await parseSvelte(SVELTE_CONTENT, 'App.svelte')

    const fallback = results.find(r => r.value === 'Fallback text')
    expect(fallback).toBeDefined()
    expect(fallback!.context).toBe('template_text')
  })

  it('should extract text inside {#each} blocks', async () => {
    const { parseSvelte } = await import('../../../src/core/ast-scanner/svelte-parser.js')
    const results = await parseSvelte(SVELTE_CONTENT, 'App.svelte')

    const listItem = results.find(r => r.value === 'List item')
    expect(listItem).toBeDefined()
    expect(listItem!.context).toBe('template_text')
  })

  it.skip('should delegate script content to tsx-parser', async () => {
    const { parseSvelte } = await import('../../../src/core/ast-scanner/svelte-parser.js')
    await parseSvelte(SVELTE_CONTENT, 'App.svelte')

    expect(mockParseTsx).toHaveBeenCalledTimes(1)
    const scriptContent = mockParseTsx.mock.calls[0]![0]
    expect(scriptContent).toContain("import { onMount } from 'svelte'")
    expect(scriptContent).toContain("let greeting = 'Hello World'")
  })

  it.skip('should set scope: template for template strings and scope: script for script strings', async () => {
    const { parseSvelte } = await import('../../../src/core/ast-scanner/svelte-parser.js')
    const results = await parseSvelte(SVELTE_CONTENT, 'App.svelte')

    const templateResults = results.filter(r => r.scope === 'template')
    expect(templateResults.length).toBeGreaterThan(0)
    for (const r of templateResults) {
      expect(r.scope).toBe('template')
    }

    const scriptResults = results.filter(r => r.scope === 'script')
    expect(scriptResults.length).toBeGreaterThan(0)
    for (const r of scriptResults) {
      expect(r.scope).toBe('script')
    }
  })

  it('should provide surrounding context string', async () => {
    const { parseSvelte } = await import('../../../src/core/ast-scanner/svelte-parser.js')
    const results = await parseSvelte(SVELTE_CONTENT, 'App.svelte')

    for (const r of results) {
      expect(typeof r.surrounding).toBe('string')
    }
  })

  it('should have 1-based line and column numbers', async () => {
    const { parseSvelte } = await import('../../../src/core/ast-scanner/svelte-parser.js')
    const results = await parseSvelte(SVELTE_CONTENT, 'App.svelte')

    for (const r of results) {
      expect(r.line).toBeGreaterThanOrEqual(1)
      expect(r.column).toBeGreaterThanOrEqual(1)
    }
  })
})

describe('svelte-parser edge cases', () => {
  beforeEach(() => {
    mockParseTsx.mockReset()
    mockParseTsx.mockReturnValue([])
  })

  it('should handle file without script block', async () => {
    currentAst = {
      html: createFragment([
        createElementNode('div', [], [
          createTextNode('Hello', 5, 10),
        ], 0, 16),
      ]),
    }

    const { parseSvelte } = await import('../../../src/core/ast-scanner/svelte-parser.js')
    const results = await parseSvelte('<div>Hello</div>', 'NoScript.svelte')

    expect(Array.isArray(results)).toBe(true)
    const hello = results.find(r => r.value === 'Hello')
    expect(hello).toBeDefined()
    expect(hello!.scope).toBe('template')
  })

  it('should skip whitespace-only text nodes', async () => {
    currentAst = {
      html: createFragment([
        createElementNode('div', [], [
          createTextNode('   \n  \t  ', 5, 15),
          createTextNode('Real content', 16, 28),
        ], 0, 34),
      ]),
    }

    const { parseSvelte } = await import('../../../src/core/ast-scanner/svelte-parser.js')
    const results = await parseSvelte('<div>\n  Real content\n</div>', 'Whitespace.svelte')

    const whitespace = results.find(r => r.value.trim() === '')
    expect(whitespace).toBeUndefined()

    const real = results.find(r => r.value === 'Real content')
    expect(real).toBeDefined()
  })

  it('should skip bind: directives', async () => {
    currentAst = {
      html: createFragment([
        createElementNode('input', [
          createBinding('value', 150, 170),
          createAttribute('placeholder', [
            { type: 'Text', data: 'Type here', start: 180, end: 189 },
          ], 167, 190),
        ], [], 145, 195),
      ]),
    }

    const { parseSvelte } = await import('../../../src/core/ast-scanner/svelte-parser.js')
    const results = await parseSvelte(
      '<input bind:value={name} placeholder="Type here" />',
      'BindInput.svelte',
    )

    const bindValue = results.find(r => r.value === 'name')
    expect(bindValue).toBeUndefined()

    const placeholder = results.find(r => r.value === 'Type here')
    expect(placeholder).toBeDefined()
    expect(placeholder!.context).toBe('template_attribute')
  })

  it('should return ExtractedString shape for all results', async () => {
    currentAst = {
      html: createFragment([
        createElementNode('p', [], [
          createTextNode('Hello there', 3, 14),
        ], 0, 18),
      ]),
    }

    const { parseSvelte } = await import('../../../src/core/ast-scanner/svelte-parser.js')
    const results = await parseSvelte('<p>Hello there</p>', 'Shape.svelte')

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
})

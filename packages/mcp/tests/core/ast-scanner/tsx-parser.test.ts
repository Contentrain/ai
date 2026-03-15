import { describe, expect, it } from 'vitest'
import { parseTsx } from '../../../src/core/ast-scanner/tsx-parser.js'

// ─── JSX text content ───

describe('parseTsx — JSX text', () => {
  it('extracts text between JSX tags', () => {
    const code = `function App() {
  return <h1>Build faster</h1>
}`
    const results = parseTsx(code, 'App.tsx')
    const jsxTexts = results.filter(r => r.context === 'jsx_text')
    expect(jsxTexts).toHaveLength(1)
    expect(jsxTexts[0]!.value).toBe('Build faster')
    expect(jsxTexts[0]!.parent).toBe('h1')
    expect(jsxTexts[0]!.scope).toBe('script')
  })

  it('extracts text from multiple nested JSX elements', () => {
    const code = `function App() {
  return (
    <div>
      <h1>Title</h1>
      <p>Description</p>
    </div>
  )
}`
    const results = parseTsx(code, 'App.tsx')
    const jsxTexts = results.filter(r => r.context === 'jsx_text')
    expect(jsxTexts).toHaveLength(2)
    expect(jsxTexts[0]!.value).toBe('Title')
    expect(jsxTexts[0]!.parent).toBe('h1')
    expect(jsxTexts[1]!.value).toBe('Description')
    expect(jsxTexts[1]!.parent).toBe('p')
  })

  it('skips whitespace-only JSX text', () => {
    const code = `function App() {
  return (
    <div>
      <span>Hello</span>
    </div>
  )
}`
    const results = parseTsx(code, 'App.tsx')
    const jsxTexts = results.filter(r => r.context === 'jsx_text')
    // Only "Hello" should appear, whitespace between tags should be skipped
    expect(jsxTexts).toHaveLength(1)
    expect(jsxTexts[0]!.value).toBe('Hello')
  })

  it('extracts JSX text from fragments', () => {
    const code = `function App() {
  return <>Welcome</>
}`
    const results = parseTsx(code, 'App.tsx')
    const jsxTexts = results.filter(r => r.context === 'jsx_text')
    expect(jsxTexts).toHaveLength(1)
    expect(jsxTexts[0]!.value).toBe('Welcome')
    expect(jsxTexts[0]!.parent).toBe('Fragment')
  })
})

// ─── JSX attribute values ───

describe('parseTsx — JSX attributes', () => {
  it('extracts JSX attribute values with attribute name', () => {
    const code = `function App() {
  return <input placeholder="Enter email" />
}`
    const results = parseTsx(code, 'App.tsx')
    const attrs = results.filter(r => r.context === 'jsx_attribute')
    expect(attrs).toHaveLength(1)
    expect(attrs[0]!.value).toBe('Enter email')
    expect(attrs[0]!.parent).toBe('placeholder')
  })

  it('extracts multiple attributes', () => {
    const code = `function App() {
  return <input placeholder="Email" aria-label="Email input" />
}`
    const results = parseTsx(code, 'App.tsx')
    const attrs = results.filter(r => r.context === 'jsx_attribute')
    expect(attrs).toHaveLength(2)
    const values = attrs.map(a => a.value)
    expect(values).toContain('Email')
    expect(values).toContain('Email input')
  })
})

// ─── Import paths ───

describe('parseTsx — import paths', () => {
  it('classifies import specifiers as import_path', () => {
    const code = `import React from 'react'
import { useState } from 'react'
import App from './App'`
    const results = parseTsx(code, 'App.tsx')
    const imports = results.filter(r => r.context === 'import_path')
    expect(imports.length).toBeGreaterThanOrEqual(3)
    const values = imports.map(i => i.value)
    expect(values).toContain('react')
    expect(values).toContain('./App')
  })

  it('classifies dynamic import() as import_path', () => {
    const code = `const module = await import('./utils')`
    const results = parseTsx(code, 'app.ts')
    const imports = results.filter(r => r.context === 'import_path')
    expect(imports).toHaveLength(1)
    expect(imports[0]!.value).toBe('./utils')
  })

  it('classifies require() as import_path', () => {
    const code = `const fs = require('node:fs')`
    const results = parseTsx(code, 'app.js')
    const imports = results.filter(r => r.context === 'import_path')
    expect(imports).toHaveLength(1)
    expect(imports[0]!.value).toBe('node:fs')
  })

  it('classifies export from as import_path', () => {
    const code = `export { foo } from './utils'`
    const results = parseTsx(code, 'index.ts')
    const imports = results.filter(r => r.context === 'import_path')
    expect(imports).toHaveLength(1)
    expect(imports[0]!.value).toBe('./utils')
  })
})

// ─── Variable assignments ───

describe('parseTsx — variable assignments', () => {
  it('extracts variable assignment with variable name', () => {
    const code = `const title = "Welcome to our site"`
    const results = parseTsx(code, 'app.ts')
    const vars = results.filter(r => r.context === 'variable_assignment')
    expect(vars).toHaveLength(1)
    expect(vars[0]!.value).toBe('Welcome to our site')
    expect(vars[0]!.parent).toBe('title')
  })

  it('extracts let and var assignments', () => {
    const code = `let greeting = "Hello"
var message = "World"`
    const results = parseTsx(code, 'app.ts')
    const vars = results.filter(r => r.context === 'variable_assignment')
    expect(vars).toHaveLength(2)
    expect(vars[0]!.parent).toBe('greeting')
    expect(vars[1]!.parent).toBe('message')
  })
})

// ─── Object properties ───

describe('parseTsx — object properties', () => {
  it('extracts object property values with key name', () => {
    const code = `const config = {
  title: "Welcome",
  subtitle: "Get started",
}`
    const results = parseTsx(code, 'app.ts')
    const props = results.filter(r => r.context === 'object_property')
    expect(props).toHaveLength(2)
    expect(props[0]!.value).toBe('Welcome')
    expect(props[0]!.parentProperty).toBe('title')
    expect(props[0]!.parent).toBe('title')
    expect(props[1]!.value).toBe('Get started')
    expect(props[1]!.parentProperty).toBe('subtitle')
  })
})

// ─── Function arguments ───

describe('parseTsx — function arguments', () => {
  it('extracts function argument with function name', () => {
    const code = `alert("Something went wrong")`
    const results = parseTsx(code, 'app.ts')
    const args = results.filter(r => r.context === 'function_argument')
    expect(args).toHaveLength(1)
    expect(args[0]!.value).toBe('Something went wrong')
    expect(args[0]!.parent).toBe('alert')
  })

  it('classifies console.log as console_call context', () => {
    const code = `console.log("debug message")`
    const results = parseTsx(code, 'app.ts')
    const consoleArgs = results.filter(r => r.context === 'console_call')
    expect(consoleArgs).toHaveLength(1)
    expect(consoleArgs[0]!.parent).toBe('console.log')
  })

  it('extracts t() translation function arguments', () => {
    const code = `const label = t("common.submit")`
    const results = parseTsx(code, 'app.ts')
    const args = results.filter(r => r.context === 'function_argument')
    expect(args).toHaveLength(1)
    expect(args[0]!.value).toBe('common.submit')
    expect(args[0]!.parent).toBe('t')
  })
})

// ─── Array elements ───

describe('parseTsx — array elements', () => {
  it('extracts array element strings', () => {
    const code = `const options = ["Option A", "Option B", "Option C"]`
    const results = parseTsx(code, 'app.ts')
    const elems = results.filter(r => r.context === 'array_element')
    expect(elems).toHaveLength(3)
    expect(elems[0]!.value).toBe('Option A')
    expect(elems[1]!.value).toBe('Option B')
    expect(elems[2]!.value).toBe('Option C')
  })
})

// ─── Enum values ───

describe('parseTsx — enum values', () => {
  it('extracts enum member values', () => {
    const code = `enum Status {
  Active = "active",
  Inactive = "inactive",
}`
    const results = parseTsx(code, 'types.ts')
    const enums = results.filter(r => r.context === 'enum_value')
    expect(enums).toHaveLength(2)
    expect(enums[0]!.value).toBe('active')
    expect(enums[0]!.parent).toBe('Active')
    expect(enums[1]!.value).toBe('inactive')
    expect(enums[1]!.parent).toBe('Inactive')
  })
})

// ─── Switch case ───

describe('parseTsx — switch case', () => {
  it('extracts switch case string values', () => {
    const code = `switch (status) {
  case "active":
    break
  case "pending":
    break
}`
    const results = parseTsx(code, 'app.ts')
    const cases = results.filter(r => r.context === 'switch_case')
    expect(cases).toHaveLength(2)
    expect(cases[0]!.value).toBe('active')
    expect(cases[1]!.value).toBe('pending')
  })
})

// ─── Type annotations ───

describe('parseTsx — type annotations', () => {
  it('classifies type alias string literals as type_annotation', () => {
    const code = `type Status = "active" | "inactive"`
    const results = parseTsx(code, 'types.ts')
    const types = results.filter(r => r.context === 'type_annotation')
    expect(types).toHaveLength(2)
    expect(types[0]!.value).toBe('active')
    expect(types[1]!.value).toBe('inactive')
  })

  it('classifies interface property types as type_annotation', () => {
    const code = `interface Config {
  mode: "dark" | "light"
}`
    const results = parseTsx(code, 'types.ts')
    const types = results.filter(r => r.context === 'type_annotation')
    expect(types).toHaveLength(2)
    const values = types.map(t => t.value)
    expect(values).toContain('dark')
    expect(values).toContain('light')
  })
})

// ─── Template literals (static parts) ───

describe('parseTsx — template literals', () => {
  it('extracts static parts from template literals with expressions', () => {
    const code = 'const msg = `Hello ${name}, welcome to ${site}`'
    const results = parseTsx(code, 'app.ts')
    // Should extract "Hello " and ", welcome to "
    const statics = results.filter(r => r.value === 'Hello ' || r.value === ', welcome to ')
    expect(statics).toHaveLength(2)
  })

  it('extracts no-substitution template literals', () => {
    const code = 'const msg = `Hello World`'
    const results = parseTsx(code, 'app.ts')
    expect(results).toHaveLength(1)
    expect(results[0]!.value).toBe('Hello World')
  })
})

// ─── Empty strings skipped ───

describe('parseTsx — empty strings', () => {
  it('skips empty string literals', () => {
    const code = `const a = ""
const b = ''`
    const results = parseTsx(code, 'app.ts')
    expect(results).toHaveLength(0)
  })
})

// ─── Line/column positions ───

describe('parseTsx — positions', () => {
  it('reports correct 1-based line and column', () => {
    const code = `const x = 1
const title = "Welcome"`
    const results = parseTsx(code, 'app.ts')
    expect(results).toHaveLength(1)
    expect(results[0]!.line).toBe(2)
    // Column should point to the opening quote of "Welcome"
    expect(results[0]!.column).toBeGreaterThan(1)
  })

  it('reports correct line for JSX text', () => {
    const code = `function App() {
  return (
    <div>
      <h1>Title</h1>
    </div>
  )
}`
    const results = parseTsx(code, 'App.tsx')
    const jsxTexts = results.filter(r => r.context === 'jsx_text')
    expect(jsxTexts).toHaveLength(1)
    expect(jsxTexts[0]!.line).toBe(4)
  })
})

// ─── Surrounding code ───

describe('parseTsx — surrounding code', () => {
  it('captures surrounding lines', () => {
    const code = `// header
const title = "Welcome"
// footer`
    const results = parseTsx(code, 'app.ts')
    expect(results).toHaveLength(1)
    expect(results[0]!.surrounding).toContain('const title = "Welcome"')
    expect(results[0]!.surrounding).toContain('// header')
    expect(results[0]!.surrounding).toContain('// footer')
  })

  it('truncates surrounding to 120 chars', () => {
    const longLine = 'a'.repeat(200)
    const code = `${longLine}
const title = "Welcome"
${longLine}`
    const results = parseTsx(code, 'app.ts')
    expect(results).toHaveLength(1)
    expect(results[0]!.surrounding.length).toBeLessThanOrEqual(120)
  })
})

// ─── Mixed file ───

describe('parseTsx — mixed TSX file', () => {
  it('correctly classifies strings in a realistic component', () => {
    const code = `import React from 'react'

interface Props {
  variant: "primary" | "secondary"
}

const BUTTON_LABEL = "Click me"

export function Hero({ variant }: Props) {
  const subtitle = "Build something amazing"

  return (
    <section>
      <h1>Welcome to our platform</h1>
      <p>{subtitle}</p>
      <button aria-label="Submit form" onClick={() => alert("Submitted!")}>
        {BUTTON_LABEL}
      </button>
    </section>
  )
}`
    const results = parseTsx(code, 'Hero.tsx')

    // Import should be classified
    const imports = results.filter(r => r.context === 'import_path')
    expect(imports.some(i => i.value === 'react')).toBe(true)

    // Type annotations
    const types = results.filter(r => r.context === 'type_annotation')
    expect(types.some(t => t.value === 'primary')).toBe(true)
    expect(types.some(t => t.value === 'secondary')).toBe(true)

    // Variable assignments
    const vars = results.filter(r => r.context === 'variable_assignment')
    expect(vars.some(v => v.value === 'Click me' && v.parent === 'BUTTON_LABEL')).toBe(true)
    expect(vars.some(v => v.value === 'Build something amazing' && v.parent === 'subtitle')).toBe(true)

    // JSX text
    const jsxTexts = results.filter(r => r.context === 'jsx_text')
    expect(jsxTexts.some(t => t.value === 'Welcome to our platform')).toBe(true)

    // JSX attribute
    const attrs = results.filter(r => r.context === 'jsx_attribute')
    expect(attrs.some(a => a.value === 'Submit form' && a.parent === 'aria-label')).toBe(true)

    // Function argument
    const fnArgs = results.filter(r => r.context === 'function_argument')
    expect(fnArgs.some(a => a.value === 'Submitted!' && a.parent === 'alert')).toBe(true)
  })
})

// ─── JS file support ───

describe('parseTsx — JS/TS files (non-JSX)', () => {
  it('handles plain JS files', () => {
    const code = `const greeting = "Hello"
module.exports = { greeting }`
    const results = parseTsx(code, 'config.js')
    expect(results).toHaveLength(1)
    expect(results[0]!.value).toBe('Hello')
    expect(results[0]!.context).toBe('variable_assignment')
  })

  it('handles TypeScript files', () => {
    const code = `type Theme = "dark" | "light"
const defaultTheme: Theme = "dark"`
    const results = parseTsx(code, 'config.ts')
    const types = results.filter(r => r.context === 'type_annotation')
    expect(types).toHaveLength(2)

    const vars = results.filter(r => r.context === 'variable_assignment')
    expect(vars).toHaveLength(1)
    expect(vars[0]!.value).toBe('dark')
  })
})

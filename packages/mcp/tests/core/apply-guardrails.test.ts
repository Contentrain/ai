import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'

vi.setConfig({ testTimeout: 60000, hookTimeout: 60000 })
import { join } from 'node:path'
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { simpleGit } from 'simple-git'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createServer } from '../../src/server.js'
import {
  validatePatchPath,
  detectFileFramework,
  validateFrameworkExpression,
  replaceInLine,
  checkSyntax,
  PATCHABLE_EXTENSIONS,
} from '../../src/core/apply-manager.js'

let testDir: string
let client: Client

async function expectGitClean(dir: string): Promise<void> {
  const status = await simpleGit(dir).status()
  expect(status.files).toHaveLength(0)
}

async function initGitRepo(dir: string): Promise<void> {
  const git = simpleGit(dir)
  await git.init()
  await git.addConfig('user.name', 'Test')
  await git.addConfig('user.email', 'test@test.com')
  await writeFile(join(dir, '.gitkeep'), '')
  await git.add('.')
  await git.commit('initial')
}

async function createTestClient(projectRoot: string): Promise<Client> {
  const server = createServer(projectRoot)
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()

  const c = new Client({ name: 'test-client', version: '1.0.0' })
  await Promise.all([
    c.connect(clientTransport),
    server.connect(serverTransport),
  ])

  return c
}

function parseResult(result: unknown): Record<string, unknown> {
  const content = (result as { content: Array<{ text: string }> }).content
  return JSON.parse(content[0]!.text) as Record<string, unknown>
}

async function createSourceFiles(dir: string): Promise<void> {
  await mkdir(join(dir, 'src', 'pages'), { recursive: true })
  await mkdir(join(dir, 'src', 'components'), { recursive: true })

  await writeFile(join(dir, 'src', 'pages', 'home.tsx'), `import React from 'react'
import { Hero } from '../components/Hero'

export default function Home() {
  return (
    <div>
      <Hero title="Welcome to our platform" />
      <p>Get started with our amazing product</p>
      <button>Sign Up</button>
    </div>
  )
}
`)

  await writeFile(join(dir, 'src', 'components', 'Hero.tsx'), `import React from 'react'

export function Hero({ title }: { title: string }) {
  return (
    <section>
      <h1>{title}</h1>
      <p>Build better software with us</p>
    </section>
  )
}
`)

  await writeFile(join(dir, 'src', 'pages', 'about.vue'), `<template>
  <div>
    <h1>About Us</h1>
    <p>We are a team of passionate developers</p>
  </div>
</template>

<script setup lang="ts">
// About page
</script>
`)

  await writeFile(join(dir, 'src', 'components', 'Button.svelte'), `<script>
  export let label = 'Click me'
</script>

<button>{label}</button>
`)
}

// ─── Unit Tests: Pure Functions ───

describe('Guardrail #1: validatePatchPath', () => {
  it('rejects paths with ".." traversal', () => {
    const err = validatePatchPath('../etc/passwd')
    expect(err).toContain('traversal')
  })

  it('rejects paths with embedded ".." segments', () => {
    const err = validatePatchPath('src/../../../etc/passwd')
    expect(err).toContain('traversal')
  })

  it('rejects absolute paths', () => {
    const err = validatePatchPath('/etc/passwd')
    expect(err).toContain('Absolute path')
  })

  it('rejects .contentrain/ paths', () => {
    const err = validatePatchPath('.contentrain/models/test.json')
    expect(err).toContain('.contentrain')
  })

  it('rejects node_modules/ paths', () => {
    const err = validatePatchPath('node_modules/react/index.js')
    expect(err).toContain('node_modules')
  })

  it('rejects .git/ paths', () => {
    const err = validatePatchPath('.git/config')
    expect(err).toContain('.git')
  })

  it('rejects non-scannable extension .json', () => {
    const err = validatePatchPath('src/data/config.json')
    expect(err).toContain('.json')
    expect(err).toContain('not patchable')
  })

  it('rejects non-scannable extension .md', () => {
    const err = validatePatchPath('docs/README.md')
    expect(err).toContain('.md')
    expect(err).toContain('not patchable')
  })

  it('rejects non-scannable extension .yml', () => {
    const err = validatePatchPath('config/settings.yml')
    expect(err).toContain('.yml')
    expect(err).toContain('not patchable')
  })

  it('rejects non-scannable extension .css', () => {
    const err = validatePatchPath('src/styles/main.css')
    expect(err).toContain('.css')
  })

  it('accepts valid .tsx path', () => {
    expect(validatePatchPath('src/pages/home.tsx')).toBeNull()
  })

  it('accepts valid .vue path', () => {
    expect(validatePatchPath('src/components/Header.vue')).toBeNull()
  })

  it('accepts valid .jsx path', () => {
    expect(validatePatchPath('src/components/Hero.jsx')).toBeNull()
  })

  it('accepts valid .svelte path', () => {
    expect(validatePatchPath('src/routes/+page.svelte')).toBeNull()
  })

  it('accepts valid .astro path', () => {
    expect(validatePatchPath('src/pages/index.astro')).toBeNull()
  })

  it('accepts valid .ts path', () => {
    expect(validatePatchPath('src/utils/strings.ts')).toBeNull()
  })

  it('accepts valid .js path', () => {
    expect(validatePatchPath('src/utils/helpers.js')).toBeNull()
  })

  it('accepts valid .mjs path', () => {
    expect(validatePatchPath('src/config.mjs')).toBeNull()
  })

  it('accepts paths with valid segments containing dot', () => {
    // ".git" is forbidden but "my.component" is fine
    expect(validatePatchPath('src/my.component/index.tsx')).toBeNull()
  })
})

describe('Guardrail #2: detectFileFramework', () => {
  it('detects .vue as vue', () => {
    expect(detectFileFramework('src/App.vue')).toBe('vue')
  })

  it('detects .svelte as svelte', () => {
    expect(detectFileFramework('src/Button.svelte')).toBe('svelte')
  })

  it('detects .tsx as jsx', () => {
    expect(detectFileFramework('src/Home.tsx')).toBe('jsx')
  })

  it('detects .jsx as jsx', () => {
    expect(detectFileFramework('src/Home.jsx')).toBe('jsx')
  })

  it('detects .astro as astro', () => {
    expect(detectFileFramework('src/Layout.astro')).toBe('astro')
  })

  it('detects .ts as script', () => {
    expect(detectFileFramework('src/utils.ts')).toBe('script')
  })

  it('detects .js as script', () => {
    expect(detectFileFramework('src/utils.js')).toBe('script')
  })

  it('detects .mjs as script', () => {
    expect(detectFileFramework('src/config.mjs')).toBe('script')
  })
})

describe('Guardrail #2: validateFrameworkExpression', () => {
  it('warns when Vue tag text lacks {{', () => {
    const warning = validateFrameworkExpression('src/App.vue', "t('key')", 'tag_text')
    expect(warning).toContain('Vue')
    expect(warning).toContain('{{')
  })

  it('accepts Vue expression with {{', () => {
    const warning = validateFrameworkExpression('src/App.vue', "{{ $t('key') }}", 'tag_text')
    expect(warning).toBeNull()
  })

  it('warns when JSX tag text lacks {', () => {
    const warning = validateFrameworkExpression('src/Home.tsx', "t('key')", 'tag_text')
    expect(warning).toContain('JSX')
    expect(warning).toContain('{')
  })

  it('accepts JSX expression with {', () => {
    const warning = validateFrameworkExpression('src/Home.tsx', "{t('key')}", 'tag_text')
    expect(warning).toBeNull()
  })

  it('warns when Svelte tag text lacks {', () => {
    const warning = validateFrameworkExpression('src/Button.svelte', "t('key')", 'tag_text')
    expect(warning).toContain('Svelte')
  })

  it('warns for script files with tag text replacement', () => {
    const warning = validateFrameworkExpression('src/utils.ts', "{t('key')}", 'tag_text')
    expect(warning).toContain('Script file')
    expect(warning).toContain('not applicable')
  })

  it('returns null for non-tag_text context', () => {
    const warning = validateFrameworkExpression('src/App.vue', "t('key')", 'other')
    expect(warning).toBeNull()
  })
})

describe('Guardrail #4: replaceInLine (safer patch matching)', () => {
  it('replaces quoted string in double quotes', () => {
    const result = replaceInLine('  title="Welcome to our platform"', 'Welcome to our platform', "{t('welcome')}")
    expect(result).toBe("  title={t('welcome')}")
  })

  it('replaces quoted string in single quotes', () => {
    const result = replaceInLine("  title='Welcome'", 'Welcome', "{t('welcome')}")
    expect(result).toBe("  title={t('welcome')}")
  })

  it('replaces tag text >old_value<', () => {
    const result = replaceInLine('      <p>Sign Up</p>', 'Sign Up', "{t('cta')}")
    expect(result).toBe("      <p>{t('cta')}</p>")
  })

  it('rejects ambiguous plain text (multiple occurrences)', () => {
    const result = replaceInLine('Submit Submit more Submit', 'Submit', '{t("submit")}')
    expect(result).toBeNull()
  })

  it('respects word boundaries — does not replace "Submit" inside "SubmitButton"', () => {
    const result = replaceInLine('const name = "SubmitButton"', 'Submit', '{t("submit")}')
    // "Submit" appears inside "SubmitButton" in a quoted string — the quoted match won't fire
    // because the quotes surround "SubmitButton" not "Submit". The plain text fallback
    // should reject it due to word boundary (surrounded by word chars on both sides).
    expect(result).toBeNull()
  })

  it('allows word-boundary-safe plain text match', () => {
    // "Submit" preceded by > and followed by space — not bounded by word chars on both sides
    const result = replaceInLine('label: Submit here', 'Submit', '{t("submit")}')
    // 'S' is preceded by space, followed by space — word boundary is fine
    expect(result).toBe('label: {t("submit")} here')
  })

  it('returns null when old_value is not found', () => {
    const result = replaceInLine('  <p>Hello</p>', 'Goodbye', '{t("bye")}')
    expect(result).toBeNull()
  })
})

describe('Guardrail #5: checkSyntax', () => {
  it('returns null for valid JS/TS', () => {
    const code = `import React from 'react'
function App() {
  return <div>{t('hello')}</div>
}
export default App
`
    expect(checkSyntax('test.tsx', code)).toBeNull()
  })

  it('detects unmatched closing bracket in JS', () => {
    const code = `function App() {
  return <div>{t('hello')}</div>
}}
`
    const err = checkSyntax('test.tsx', code)
    expect(err).not.toBeNull()
    expect(err).toContain('Unmatched')
  })

  it('detects unclosed bracket in JS', () => {
    const code = `function App() {
  return <div>{t('hello')}</div>

`
    const err = checkSyntax('test.tsx', code)
    expect(err).not.toBeNull()
    expect(err).toContain('Unclosed')
  })

  it('detects unterminated string literal', () => {
    const code = `const msg = "hello
const other = 'test'
`
    const err = checkSyntax('test.ts', code)
    expect(err).not.toBeNull()
    expect(err).toContain('Unterminated')
  })

  it('returns null for valid Vue SFC', () => {
    const code = `<template>
  <div>
    <p>Hello</p>
  </div>
</template>

<script setup>
const msg = 'hello'
</script>
`
    expect(checkSyntax('test.vue', code)).toBeNull()
  })

  it('detects unbalanced template tag in Vue', () => {
    const code = `<template>
  <div>
    <p>Hello</p>
  </div>

<script setup>
const msg = 'hello'
</script>
`
    const err = checkSyntax('test.vue', code)
    expect(err).not.toBeNull()
    expect(err).toContain('template')
  })

  it('returns null for valid Svelte', () => {
    const code = `<script>
  let name = 'world'
</script>

<main>
  <h1>Hello {name}!</h1>
</main>
`
    expect(checkSyntax('test.svelte', code)).toBeNull()
  })

  it('detects unbalanced div in Svelte', () => {
    const code = `<div>
  <div>
    <p>Hello</p>
  </div>
`
    const err = checkSyntax('test.svelte', code)
    expect(err).not.toBeNull()
    expect(err).toContain('div')
  })

  it('handles template literals (backtick strings) correctly', () => {
    const code = 'const msg = `hello\nworld`\n'
    expect(checkSyntax('test.ts', code)).toBeNull()
  })

  it('handles comments correctly', () => {
    const code = `// This is a comment with { unmatched bracket
/* This is a block comment with } another */
function test() {
  return 42
}
`
    expect(checkSyntax('test.ts', code)).toBeNull()
  })
})

describe('PATCHABLE_EXTENSIONS constant', () => {
  it('includes all expected scannable extensions', () => {
    expect(PATCHABLE_EXTENSIONS.has('.vue')).toBe(true)
    expect(PATCHABLE_EXTENSIONS.has('.tsx')).toBe(true)
    expect(PATCHABLE_EXTENSIONS.has('.jsx')).toBe(true)
    expect(PATCHABLE_EXTENSIONS.has('.ts')).toBe(true)
    expect(PATCHABLE_EXTENSIONS.has('.js')).toBe(true)
    expect(PATCHABLE_EXTENSIONS.has('.mjs')).toBe(true)
    expect(PATCHABLE_EXTENSIONS.has('.astro')).toBe(true)
    expect(PATCHABLE_EXTENSIONS.has('.svelte')).toBe(true)
  })

  it('does not include non-source extensions', () => {
    expect(PATCHABLE_EXTENSIONS.has('.json')).toBe(false)
    expect(PATCHABLE_EXTENSIONS.has('.md')).toBe(false)
    expect(PATCHABLE_EXTENSIONS.has('.yml')).toBe(false)
    expect(PATCHABLE_EXTENSIONS.has('.yaml')).toBe(false)
    expect(PATCHABLE_EXTENSIONS.has('.css')).toBe(false)
    expect(PATCHABLE_EXTENSIONS.has('.html')).toBe(false)
  })
})

// ─── Integration Tests: Through MCP Client ───

describe('Guardrail #1: Scope enforcement via MCP', () => {
  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'cr-guardrail-test-'))
    await initGitRepo(testDir)
    await createSourceFiles(testDir)

    const git = simpleGit(testDir)
    await git.add('.')
    await git.commit('add source files')

    client = await createTestClient(testDir)
    await client.callTool({ name: 'contentrain_init', arguments: {} })
    await expectGitClean(testDir)

    client = await createTestClient(testDir)

    // Create a model so scope validation passes
    await client.callTool({
      name: 'contentrain_model_save',
      arguments: {
        id: 'ui-texts',
        name: 'UI Texts',
        kind: 'dictionary',
        domain: 'app',
        i18n: true,
        fields: { welcome_title: { type: 'string' } },
      },
    })
    await expectGitClean(testDir)
    client = await createTestClient(testDir)
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
  })

  it('rejects patch with ".." traversal path', async () => {
    const result = await client.callTool({
      name: 'contentrain_apply',
      arguments: {
        mode: 'reuse',
        dry_run: true,
        scope: { model: 'ui-texts' },
        patches: [
          { file: '../../../etc/passwd', line: 1, old_value: 'root', new_expression: 'hacked' },
        ],
      },
    })

    const data = parseResult(result)
    expect(data['error']).toBeDefined()
    expect(String(data['error'])).toContain('traversal')
  })

  it('rejects patch with non-patchable extension (.json)', async () => {
    const result = await client.callTool({
      name: 'contentrain_apply',
      arguments: {
        mode: 'reuse',
        dry_run: true,
        scope: { model: 'ui-texts' },
        patches: [
          { file: 'src/data/config.json', line: 1, old_value: 'test', new_expression: 'hacked' },
        ],
      },
    })

    const data = parseResult(result)
    expect(data['error']).toBeDefined()
    expect(String(data['error'])).toContain('not patchable')
  })

  it('rejects patch targeting .contentrain/ directory', async () => {
    const result = await client.callTool({
      name: 'contentrain_apply',
      arguments: {
        mode: 'reuse',
        dry_run: true,
        scope: { model: 'ui-texts' },
        patches: [
          { file: '.contentrain/models/ui-texts.json', line: 1, old_value: 'test', new_expression: 'hacked' },
        ],
      },
    })

    const data = parseResult(result)
    expect(data['error']).toBeDefined()
    expect(String(data['error'])).toContain('.contentrain')
  })

  it('rejects patch targeting node_modules/', async () => {
    const result = await client.callTool({
      name: 'contentrain_apply',
      arguments: {
        mode: 'reuse',
        dry_run: true,
        scope: { model: 'ui-texts' },
        patches: [
          { file: 'node_modules/react/index.js', line: 1, old_value: 'test', new_expression: 'hacked' },
        ],
      },
    })

    const data = parseResult(result)
    expect(data['error']).toBeDefined()
    expect(String(data['error'])).toContain('node_modules')
  })

  it('accepts patch with valid .tsx path', async () => {
    const result = await client.callTool({
      name: 'contentrain_apply',
      arguments: {
        mode: 'reuse',
        dry_run: true,
        scope: { model: 'ui-texts' },
        patches: [
          { file: 'src/pages/home.tsx', line: 7, old_value: 'Welcome to our platform', new_expression: "{t('welcome')}" },
        ],
      },
    })

    const data = parseResult(result)
    expect(data['error']).toBeUndefined()
    expect(data['dry_run']).toBe(true)
    expect(data['preview']).toBeDefined()
  })
})

describe('Guardrail #3: Preview-Execute Parity', () => {
  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'cr-preview-parity-test-'))
    await initGitRepo(testDir)
    await createSourceFiles(testDir)

    const git = simpleGit(testDir)
    await git.add('.')
    await git.commit('add source files')

    client = await createTestClient(testDir)
    await client.callTool({ name: 'contentrain_init', arguments: {} })
    await expectGitClean(testDir)
    client = await createTestClient(testDir)
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
  })

  it('uses real model metadata for existing model preview', async () => {
    // Create a model with custom content_path
    await client.callTool({
      name: 'contentrain_model_save',
      arguments: {
        id: 'ui-texts',
        name: 'UI Texts',
        kind: 'dictionary',
        domain: 'app',
        i18n: true,
        fields: { welcome_title: { type: 'string' } },
      },
    })
    await expectGitClean(testDir)
    client = await createTestClient(testDir)

    // Now request a preview for an extraction that references the existing model
    const result = await client.callTool({
      name: 'contentrain_apply',
      arguments: {
        mode: 'extract',
        dry_run: true,
        extractions: [{
          model: 'ui-texts',
          kind: 'dictionary',
          domain: 'app',
          entries: [
            { locale: 'en', data: { welcome_title: 'Welcome to our platform' } },
          ],
        }],
      },
    })

    const data = parseResult(result)
    expect(data['dry_run']).toBe(true)
    const preview = data['preview'] as Record<string, unknown>
    // Model should be in update list (not create) since it exists
    expect(preview['models_to_update']).toContain('ui-texts')
    // Content files should be generated using real model metadata
    expect((preview['content_files'] as string[]).length).toBeGreaterThan(0)
  })
})

describe('Guardrail #5: Syntax check via MCP (integration)', () => {
  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'cr-syntax-test-'))
    await initGitRepo(testDir)

    // Create a file that will produce a syntax error after patching
    await mkdir(join(testDir, 'src'), { recursive: true })
    await writeFile(join(testDir, 'src', 'broken.tsx'), `import React from 'react'

export function Broken() {
  return (
    <div>
      <p>Original text</p>
    </div>
  )
}
`)

    const git = simpleGit(testDir)
    await git.add('.')
    await git.commit('add source files')

    client = await createTestClient(testDir)
    await client.callTool({ name: 'contentrain_init', arguments: {} })
    await expectGitClean(testDir)

    client = await createTestClient(testDir)

    await client.callTool({
      name: 'contentrain_model_save',
      arguments: {
        id: 'ui-texts',
        name: 'UI Texts',
        kind: 'dictionary',
        domain: 'app',
        i18n: true,
        fields: { text: { type: 'string' } },
      },
    })
    await expectGitClean(testDir)
    client = await createTestClient(testDir)
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
  })

  it('reports no syntax errors for valid patched file', async () => {
    const result = await client.callTool({
      name: 'contentrain_apply',
      arguments: {
        mode: 'reuse',
        dry_run: false,
        scope: { model: 'ui-texts' },
        patches: [
          {
            file: 'src/broken.tsx',
            line: 6,
            old_value: 'Original text',
            new_expression: "{t('text')}",
          },
        ],
      },
    })

    const data = parseResult(result)
    const results = data['results'] as Record<string, unknown>
    expect(results['patches_applied']).toBe(1)
    // No syntax errors for a valid replacement
    expect(results['syntax_errors']).toBeUndefined()
  })
})

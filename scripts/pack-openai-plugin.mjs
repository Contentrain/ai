#!/usr/bin/env node
/**
 * Zip plugins/contentrain-openai/ for the OpenAI plugin directory upload
 * (developers.openai.com/plugins/deploy/submission).
 *
 * The files sit at the archive root: plugin.json, mcp.json, assets/. The ZIP
 * is a build artifact, written under dist/ and never committed; run
 * `pnpm plugin:build` first so the package matches the current version.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PKG_DIR = join(ROOT, 'plugins/contentrain-openai')
const FILES = ['plugin.json', 'mcp.json', 'assets/logo.svg']

for (const file of FILES) {
  if (!existsSync(join(PKG_DIR, file))) {
    console.error(`✘ ${join(PKG_DIR, file)} is missing — run \`pnpm plugin:build\` first`)
    process.exit(1)
  }
}

const { version } = JSON.parse(readFileSync(join(PKG_DIR, 'plugin.json'), 'utf-8'))
const outDir = join(ROOT, 'dist/openai-plugin')
const out = join(outDir, `contentrain-${version}.zip`)
mkdirSync(outDir, { recursive: true })
rmSync(out, { force: true })
// -X drops extra file attributes; listing the files keeps .DS_Store and the
// like out of the archive.
execFileSync('zip', ['-X', '-q', out, ...FILES], { cwd: PKG_DIR, stdio: 'inherit' })
console.log(`✔ ${out}`)

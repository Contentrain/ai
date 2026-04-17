import { join } from 'node:path'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { simpleGit } from 'simple-git'
import { ensureDir, writeJson } from '@contentrain/mcp/util/fs'
import { writeFile } from 'node:fs/promises'
import { writeModel } from '@contentrain/mcp/core/model-manager'
import { getTemplate } from '@contentrain/mcp/templates'
import type { ContentrainConfig, Vocabulary } from '@contentrain/types'

/**
 * Creates a temporary demo project with a blog template.
 * Returns the project root path.
 */
export async function createDemoProject(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'contentrain-demo-'))

  // Git init
  const git = simpleGit(dir)
  await git.init()
  await git.addConfig('user.email', 'demo@contentrain.io')
  await git.addConfig('user.name', 'Contentrain Demo')

  // Create .contentrain/ structure
  const crDir = join(dir, '.contentrain')
  await Promise.all(['models', 'content', 'meta'].map(async (sub) => {
    await ensureDir(join(crDir, sub))
    await writeFile(join(crDir, sub, '.gitkeep'), '', 'utf-8')
  }))

  // Config
  const config: ContentrainConfig = {
    version: 1,
    stack: 'other' as ContentrainConfig['stack'],
    workflow: 'auto-merge',
    locales: { default: 'en', supported: ['en'] },
    domains: ['marketing', 'blog', 'system'],
  }
  await writeJson(join(crDir, 'config.json'), config)

  // Vocabulary
  const vocabulary: Vocabulary = { version: 1, terms: {} }
  await writeJson(join(crDir, 'vocabulary.json'), vocabulary)

  // Context
  await writeJson(join(crDir, 'context.json'), {
    version: '1',
    lastOperation: {
      tool: 'contentrain_init',
      model: '',
      locale: 'en',
      timestamp: new Date().toISOString(),
      source: 'demo',
    },
    stats: { models: 0, entries: 0, locales: ['en'], lastSync: new Date().toISOString() },
  })

  // Apply blog template models
  const tmpl = getTemplate('blog')
  if (tmpl) {
    for (const model of tmpl.models) {
      await writeModel(dir, model)
    }
  }

  // Initial commit
  await git.add('.')
  await git.commit('[contentrain] demo project')

  return dir
}

/**
 * Clean up a demo project directory.
 */
export async function cleanupDemoProject(dir: string): Promise<void> {
  try {
    await rm(dir, { recursive: true, force: true })
  } catch {
    // Best-effort cleanup
  }
}

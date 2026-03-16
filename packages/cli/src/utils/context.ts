import type { ContentrainConfig, ContextJson, Vocabulary } from '@contentrain/types'
import type { ModelSummary } from '@contentrain/mcp/core/model-manager'
import { resolve, join } from 'node:path'
import { readConfig, readVocabulary } from '@contentrain/mcp/core/config'
import { readContext } from '@contentrain/mcp/core/context'
import { listModels } from '@contentrain/mcp/core/model-manager'
import { pathExists, contentrainDir } from '@contentrain/mcp/util/fs'

export interface ProjectContext {
  projectRoot: string
  crDir: string
  initialized: boolean
  config: ContentrainConfig | null
  context: ContextJson | null
  models: ModelSummary[]
  vocabulary: Vocabulary | null
}

export async function resolveProjectRoot(argRoot?: string): Promise<string> {
  return resolve(argRoot ?? process.env['CONTENTRAIN_PROJECT_ROOT'] ?? process.cwd())
}

export async function loadProjectContext(projectRoot: string): Promise<ProjectContext> {
  const crDir = contentrainDir(projectRoot)
  const hasConfigFile = await pathExists(join(crDir, 'config.json'))

  if (!hasConfigFile) {
    return { projectRoot, crDir, initialized: false, config: null, context: null, models: [], vocabulary: null }
  }

  const config = await readConfig(projectRoot)
  if (!config) {
    return { projectRoot, crDir, initialized: false, config: null, context: null, models: [], vocabulary: null }
  }

  const [context, models, vocabulary] = await Promise.all([
    readContext(projectRoot),
    listModels(projectRoot),
    readVocabulary(projectRoot),
  ])

  return { projectRoot, crDir, initialized: true, config, context, models, vocabulary }
}

export function requireInitialized(
  ctx: ProjectContext,
): asserts ctx is ProjectContext & { initialized: true; config: ContentrainConfig } {
  if (!ctx.initialized || !ctx.config) {
    throw new Error('Project not initialized. Run `contentrain init` first.')
  }
}

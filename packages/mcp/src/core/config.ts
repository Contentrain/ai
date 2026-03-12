import type { ContentrainConfig, Vocabulary } from '@contentrain/types'
import { join } from 'node:path'
import { contentrainDir, readJson } from '../util/fs.js'

export async function readConfig(projectRoot: string): Promise<ContentrainConfig | null> {
  const raw = await readJson<Partial<ContentrainConfig>>(join(contentrainDir(projectRoot), 'config.json'))
  if (!raw) return null

  // Normalize with safe defaults
  return {
    version: raw.version ?? 1,
    stack: raw.stack ?? 'other',
    workflow: raw.workflow ?? 'auto-merge',
    locales: {
      default: raw.locales?.default ?? 'en',
      supported: raw.locales?.supported ?? [raw.locales?.default ?? 'en'],
    },
    domains: raw.domains ?? [],
    repository: raw.repository,
    assets_path: raw.assets_path,
    branchRetention: raw.branchRetention,
  }
}

export async function readVocabulary(projectRoot: string): Promise<Vocabulary | null> {
  return readJson<Vocabulary>(join(contentrainDir(projectRoot), 'vocabulary.json'))
}

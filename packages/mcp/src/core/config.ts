import type { ContentrainConfig, Vocabulary } from '@contentrain/types'
import { join } from 'node:path'
import { contentrainDir, readJson } from '../util/fs.js'

export async function readConfig(projectRoot: string): Promise<ContentrainConfig | null> {
  return readJson<ContentrainConfig>(join(contentrainDir(projectRoot), 'config.json'))
}

export async function readVocabulary(projectRoot: string): Promise<Vocabulary | null> {
  return readJson<Vocabulary>(join(contentrainDir(projectRoot), 'vocabulary.json'))
}

import type { ContextJson } from '@contentrain/types'
import { join } from 'node:path'
import { contentrainDir, readJson } from '../util/fs.js'

export async function readContext(projectRoot: string): Promise<ContextJson | null> {
  return readJson<ContextJson>(join(contentrainDir(projectRoot), 'context.json'))
}

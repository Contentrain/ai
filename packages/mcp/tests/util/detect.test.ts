import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { join } from 'node:path'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { detectStack } from '../../src/util/detect.js'

let testDir: string

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), 'cr-detect-test-'))
})

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true })
})

describe('detectStack', () => {
  it('detects Hugo projects from hugo.toml', async () => {
    await writeFile(join(testDir, 'hugo.toml'), 'baseURL = "https://example.com"\n')

    const stack = await detectStack(testDir)

    expect(stack).toBe('hugo')
  })
})

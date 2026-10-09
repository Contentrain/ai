import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { simpleGit } from 'simple-git'

/**
 * Create a bare repository in a temp dir and register it as a remote of
 * `repoDir`. A file-path remote makes push / ls-remote / push --delete work
 * fully offline, so remote-lifecycle behavior can be asserted in tests.
 *
 * Returns the bare repo's path (pass it to {@link remoteHeads}; remove it in
 * the test's cleanup).
 */
export async function addBareRemote(repoDir: string, remoteName = 'origin'): Promise<string> {
  const remoteDir = await mkdtemp(join(tmpdir(), 'cr-bare-remote-'))
  await simpleGit(remoteDir).init(true)
  await simpleGit(repoDir).addRemote(remoteName, remoteDir)
  return remoteDir
}

/** List the branch names currently present on a bare remote. */
export async function remoteHeads(remoteDir: string): Promise<string[]> {
  const raw = await simpleGit(remoteDir).raw(['for-each-ref', '--format=%(refname:short)', 'refs/heads'])
  return raw.split('\n').map(s => s.trim()).filter(Boolean)
}

/**
 * A bare remote that records every ref update it receives. Its pre-receive
 * hook appends one line per updated ref (branch push and `push --delete`
 * alike) to a log, so {@link CountingRemote.pushes} is the number of pushes
 * that actually reached the remote — the witness for local mode.
 */
export interface CountingRemote {
  dir: string
  /** Ref updates received since the last {@link CountingRemote.reset}. */
  pushes: () => Promise<number>
  /** Forget pushes so far (after seeding the remote). */
  reset: () => Promise<void>
}

export async function addCountingRemote(repoDir: string, remoteName = 'origin'): Promise<CountingRemote> {
  const dir = await addBareRemote(repoDir, remoteName)
  const log = join(dir, 'received.log')
  await writeFile(log, '')
  await writeFile(join(dir, 'hooks', 'pre-receive'), `#!/bin/sh\ncat >> "${log}"\n`, { mode: 0o755 })
  return {
    dir,
    pushes: async () => (await readFile(log, 'utf8')).split('\n').filter(Boolean).length,
    reset: () => writeFile(log, ''),
  }
}

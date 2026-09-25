import { spawn } from 'node:child_process'
import type { RepoReader } from '../core/contracts/index.js'
import { gitBinary } from './identity.js'

/**
 * RefSnapshotReader — a `RepoReader` over one subtree of one commit, read
 * with two git spawns in total however many files the caller touches.
 *
 * `GitRefReader` spawns `git show` per file, which is right for a planner
 * reading a handful of paths and wrong for a tool that walks every model and
 * every locale file (`content_list`, `status`, validation): a few hundred
 * spawns per call (#229). Here one `ls-tree -r` lists the subtree — which
 * answers `listDirectory` and `fileExists` from memory — and the first
 * `readFile` pulls every content blob under it through a single
 * `cat-file --batch`. Only content is batched ({@link batched}): media under
 * `assets_path`, and any large or non-text file, is read on demand, one
 * `cat-file blob` each, so a list or a save never loads the project's images.
 *
 * Bound to a commit sha, not a branch name, so a snapshot never changes
 * under its reader; {@link loadRefSnapshot} caches one per (repo, sha).
 *
 * Paths are repo-relative with `/` separators; the caller maps its own paths
 * (see LocalProvider). Only paths under `root` are in the snapshot — anything
 * else reads as missing.
 */
export class RefSnapshotReader implements RepoReader {
  private blobs: Promise<Map<string, string>> | null = null
  private readonly single = new Map<string, Promise<string>>()

  constructor(
    private readonly repoDir: string,
    public readonly commit: string,
    public readonly root: string,
    /** repo-relative file path → blob oid and size in bytes */
    private readonly files: ReadonlyMap<string, SnapshotFile>,
    /** repo-relative directory path → child names */
    private readonly dirs: ReadonlyMap<string, readonly string[]>,
  ) {}

  async readFile(path: string, _ref?: string): Promise<string> {
    const p = trim(path)
    const file = this.files.get(p)
    if (!file) throw Object.assign(new Error(`ENOENT: ${path} is not in ${this.commit.slice(0, 8)}:${this.root}`), { code: 'ENOENT' })
    if (!batched(p, file.size)) {
      let text = this.single.get(file.oid)
      if (!text) {
        text = runGit(this.repoDir, ['cat-file', 'blob', file.oid]).then(buf => buf.toString('utf-8'))
        text.catch(() => this.single.delete(file.oid))
        this.single.set(file.oid, text)
      }
      return text
    }
    this.blobs ??= readBlobs(this.repoDir, [...new Set([...this.files].filter(([f, { size }]) => batched(f, size)).map(([, { oid }]) => oid))])
    const text = (await this.blobs).get(file.oid)
    if (text === undefined) throw new Error(`blob ${file.oid} for ${path} could not be read`)
    return text
  }

  async listDirectory(path: string, _ref?: string): Promise<string[]> {
    return [...(this.dirs.get(trim(path)) ?? [])]
  }

  async fileExists(path: string, _ref?: string): Promise<boolean> {
    const p = trim(path)
    return this.files.has(p) || this.dirs.has(p)
  }
}

interface SnapshotFile { oid: string, size: number }

/** Largest blob the batch loads; a content file is far smaller. */
const BATCH_MAX_BYTES = 1024 * 1024

/**
 * Whether the first `readFile` loads this file with the rest: a content file —
 * JSON (config, models, content, meta) or Markdown (documents) — no larger
 * than {@link BATCH_MAX_BYTES}. Media never matches by extension, wherever
 * `assets_path` points.
 */
function batched(path: string, size: number): boolean {
  return size <= BATCH_MAX_BYTES && /\.(?:json|md|mdx)$/i.test(path)
}

const snapshots = new Map<string, Promise<RefSnapshotReader>>()
const MAX_SNAPSHOTS = 8

/**
 * The snapshot of `root` at `commit`, listed once per (repo, commit) for the
 * life of the process: a commit's tree never changes, so a later tool call on
 * an unmoved branch costs no spawn at all.
 */
export function loadRefSnapshot(repoDir: string, commit: string, root: string): Promise<RefSnapshotReader> {
  const key = `${repoDir}\0${commit}\0${root}`
  let hit = snapshots.get(key)
  if (!hit) {
    hit = listTree(repoDir, commit, root)
    hit.catch(() => snapshots.delete(key))
    snapshots.set(key, hit)
    // Oldest-first eviction; a long-lived server sees a new tip per write.
    if (snapshots.size > MAX_SNAPSHOTS) snapshots.delete(snapshots.keys().next().value!)
  }
  return hit
}

async function listTree(repoDir: string, commit: string, root: string): Promise<RefSnapshotReader> {
  const raw = await runGit(repoDir, ['ls-tree', '-r', '-l', '-z', '--full-tree', commit, '--', root])
  const files = new Map<string, SnapshotFile>()
  const children = new Map<string, Set<string>>()
  for (const record of raw.toString('utf-8').split('\0')) {
    if (!record) continue
    // "<mode> <type> <oid> <size, space-padded>\t<path>"
    const tab = record.indexOf('\t')
    const [, type, oid, size] = record.slice(0, tab).split(/ +/)
    if (type !== 'blob' || !oid) continue
    const path = record.slice(tab + 1)
    files.set(path, { oid, size: Number(size) })
    // Register every ancestor directory down from the repo root.
    const parts = path.split('/')
    for (let i = 0; i < parts.length; i++) {
      const dir = parts.slice(0, i).join('/')
      let set = children.get(dir)
      if (!set) children.set(dir, set = new Set())
      set.add(parts[i]!)
    }
  }
  const dirs = new Map([...children].map(([dir, names]) => [dir, [...names].toSorted()] as const))
  return new RefSnapshotReader(repoDir, commit, root, files, dirs)
}

/** The given blobs in one `cat-file --batch` process. */
async function readBlobs(repoDir: string, oids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (oids.length === 0) return out
  const buf = await runGit(repoDir, ['cat-file', '--batch'], `${oids.join('\n')}\n`)
  // Each record: "<oid> <type> <size>\n<size bytes>\n"
  let at = 0
  while (at < buf.length) {
    const eol = buf.indexOf(0x0A, at)
    if (eol < 0) break
    const [oid, , size] = buf.subarray(at, eol).toString('utf-8').split(' ')
    const bytes = Number(size)
    if (!oid || !Number.isFinite(bytes)) break
    out.set(oid, buf.subarray(eol + 1, eol + 1 + bytes).toString('utf-8'))
    at = eol + 1 + bytes + 1
  }
  return out
}

function runGit(cwd: string, args: string[], stdin?: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(gitBinary(), args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] })
    const chunks: Buffer[] = []
    let stderr = ''
    child.stdout.on('data', (c: Buffer) => chunks.push(c))
    child.stderr.on('data', (c: Buffer) => { stderr += c.toString() })
    child.on('error', reject)
    // git may exit before reading all of stdin (a bad ref, a missing object): the write then fails
    // with EPIPE. The exit code below reports that failure; unhandled, it would crash the process.
    child.stdin.on('error', () => {})
    child.on('close', (code) => {
      if (code === 0) resolve(Buffer.concat(chunks))
      else reject(new Error(`git ${args[0]} exited ${code}: ${stderr.trim()}`))
    })
    child.stdin.end(stdin ?? '')
  })
}

function trim(path: string): string {
  let p = path.replaceAll('\\', '/')
  while (p.startsWith('./')) p = p.slice(2)
  while (p.endsWith('/')) p = p.slice(0, -1)
  return p === '.' ? '' : p
}

// What the agent may touch in the project it is writing.
//
// Content is copied from WordPress deterministically and edited in Studio;
// the agent writes programs, never data. So it may write only views, the
// site's own components and the site stylesheet, and it may not read content
// entries at all — field names come from the models, which it may read. A
// component that needs text gets it through a prop bound to content, which
// is what keeps a Studio edit reaching the page.

import { lstat, realpath } from 'node:fs/promises'
import { dirname, isAbsolute, normalize, relative, resolve, sep } from 'node:path'

/** Project-relative prefixes the agent may write. A trailing slash means a directory. */
export const WRITABLE: readonly string[] = ['src/views/', 'src/components/site/', 'src/styles/site.css']

/** Project-relative prefixes the agent may not read. */
export const UNREADABLE: readonly string[] = ['.contentrain/content/', '.contentrain/meta/', '.env', 'node_modules/']

/** Files a written file may have: Astro components, their TypeScript helpers, and the stylesheet. */
const WRITABLE_EXTENSIONS = /\.(?:astro|ts|css)$/

export class GuardError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GuardError'
  }
}

/** A project-relative path in POSIX form, or a GuardError for anything that could leave the project. */
function normalizeRelative(path: string): string {
  if (typeof path !== 'string' || path.trim() === '') throw new GuardError('path is empty')
  if (path.includes('\0')) throw new GuardError('path contains a NUL byte')
  if (isAbsolute(path) || /^[a-zA-Z]:/.test(path)) throw new GuardError(`"${path}" is absolute — give a path relative to the project`)
  const clean = normalize(path).split(sep).join('/')
  if (clean === '..' || clean.startsWith('../')) throw new GuardError(`"${path}" leaves the project`)
  return clean.replace(/^\.\//, '')
}

const matches = (path: string, prefixes: readonly string[]) =>
  prefixes.some(prefix => (prefix.endsWith('/') ? path.startsWith(prefix) : path === prefix))

/**
 * The real directory a path's nearest existing ancestor resolves to must still be
 * inside the project — and, for a write, outside .contentrain/: a symlink under
 * src/views/ pointing at .contentrain/ is refused.
 */
async function assertInside(root: string, absolute: string, path: string, forWrite: boolean): Promise<void> {
  const realRoot = await realpath(root)
  let probe = absolute
  for (;;) {
    try {
      await lstat(probe)
      break
    } catch {
      const parent = dirname(probe)
      if (parent === probe) break
      probe = parent
    }
  }
  const real = await realpath(probe)
  const rel = relative(realRoot, real)
  if (rel.startsWith('..') || isAbsolute(rel)) throw new GuardError(`"${path}" resolves outside the project`)
  const realRel = rel.split(sep).join('/')
  if (forWrite && (matches(`${realRel}/`, ['.contentrain/']) || realRel === '.contentrain')) throw new GuardError(`"${path}" resolves into .contentrain/`)
}

/** The absolute path the agent may write `path` to, or a GuardError saying why not. */
export async function writablePath(root: string, path: string): Promise<string> {
  const rel = normalizeRelative(path)
  if (!matches(rel, WRITABLE)) {
    throw new GuardError(`"${rel}" is not writable. The agent writes only ${WRITABLE.join(', ')}; content lives in .contentrain and is never written by the agent.`)
  }
  if (!WRITABLE_EXTENSIONS.test(rel)) throw new GuardError(`"${rel}" is not an .astro, .ts or .css file`)
  const absolute = resolve(root, rel)
  await assertInside(root, absolute, rel, true)
  return absolute
}

/** The absolute path the agent may read `path` from, or a GuardError. */
export async function readablePath(root: string, path: string): Promise<string> {
  const rel = normalizeRelative(path)
  if (matches(rel, UNREADABLE) || rel === '.env') {
    throw new GuardError(`"${rel}" is not readable: entries are content, and the agent works from models (.contentrain/models/) and props, not content.`)
  }
  const absolute = resolve(root, rel)
  await assertInside(root, absolute, rel, false)
  const realRel = relative(await realpath(root), await realpath(absolute).catch(() => absolute)).split(sep).join('/')
  if (matches(realRel, UNREADABLE)) throw new GuardError(`"${rel}" resolves to content`)
  return absolute
}

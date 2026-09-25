// Commands the agent may run in the project, with bounded time and output.

import { execFile } from 'node:child_process'

export interface CommandResult {
  ok: boolean
  /** The end of the combined output: errors are at the end. */
  output: string
}

const TAIL = 12_000
/** ANSI colour sequences, built from the ESC code point so the pattern has no literal control character. */
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g')

export function runCommand(cwd: string, command: string, args: string[], timeoutMs = 300_000): Promise<CommandResult> {
  return new Promise((done) => {
    execFile(command, args, { cwd, timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024, env: { ...process.env, CI: 'true', FORCE_COLOR: '0' } }, (error, stdout, stderr) => {
      const output = `${stdout}\n${stderr}`.replace(ANSI, '')
      done({ ok: !error, output: output.length > TAIL ? `…\n${output.slice(-TAIL)}` : output })
    })
  })
}

/** `astro check` then `astro build` — what every change must survive. */
export async function build(cwd: string): Promise<CommandResult> {
  const check = await runCommand(cwd, 'pnpm', ['exec', 'astro', 'check'])
  if (!check.ok) return { ok: false, output: `astro check failed:\n${check.output}` }
  const built = await runCommand(cwd, 'pnpm', ['exec', 'astro', 'build'])
  return built.ok ? { ok: true, output: 'astro check: 0 errors; astro build: ok' } : { ok: false, output: `astro build failed:\n${built.output}` }
}

/** The starter's gates beyond the build: knip and the built-site checks. */
export async function gates(cwd: string): Promise<CommandResult> {
  const knip = await runCommand(cwd, 'pnpm', ['exec', 'knip'])
  const dist = await runCommand(cwd, 'node', ['scripts/check-dist.mjs'])
  return { ok: knip.ok && dist.ok, output: `knip: ${knip.ok ? 'clean' : knip.output}\n${dist.output}` }
}

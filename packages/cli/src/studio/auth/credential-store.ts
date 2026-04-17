// ---------------------------------------------------------------------------
// Secure credential storage for Studio CLI integration.
//
// Credentials are stored in ~/.contentrain/credentials.json — NEVER inside
// the project's .contentrain/ directory (which is git-tracked).
//
// Security invariants enforced here:
//   1. File permissions 0o600, directory permissions 0o700 (POSIX)
//   2. Environment variable CONTENTRAIN_STUDIO_TOKEN takes priority (CI/CD)
//   3. clearCredentials overwrites file content before unlinking
//   4. Warnings emitted when permissions are too open
// ---------------------------------------------------------------------------

import { readFile, writeFile, unlink, stat, chmod, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { StudioCredentials, StudioConfig } from '../types.js'

const DIR_NAME = '.contentrain'
const FILE_NAME = 'credentials.json'
const FILE_MODE = 0o600
const DIR_MODE = 0o700

const DEFAULT_STUDIO_URL = 'https://studio.contentrain.io'

// ── Public API ────────────────────────────────────────────────────────────

/** Absolute path to the credentials file. */
export function getCredentialsPath(): string {
  return join(homedir(), DIR_NAME, FILE_NAME)
}

/** Absolute path to the credentials directory. */
export function getCredentialsDir(): string {
  return join(homedir(), DIR_NAME)
}

/**
 * Load Studio credentials.
 *
 * Resolution order:
 *   1. CONTENTRAIN_STUDIO_TOKEN env var  (CI/CD — no file I/O)
 *   2. ~/.contentrain/credentials.json   (developer workstation)
 *   3. null                              (not authenticated)
 */
export async function loadCredentials(): Promise<StudioCredentials | null> {
  // CI/CD fast-path: env var bypasses all file I/O
  const envToken = process.env['CONTENTRAIN_STUDIO_TOKEN']
  if (envToken) {
    return {
      studioUrl: process.env['CONTENTRAIN_STUDIO_URL'] ?? DEFAULT_STUDIO_URL,
      accessToken: envToken,
      refreshToken: '',
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    }
  }

  const filePath = getCredentialsPath()

  try {
    const raw = await readFile(filePath, 'utf-8')
    const config: StudioConfig = JSON.parse(raw)

    if (config.version !== 1 || !config.credentials?.accessToken) {
      return null
    }

    return config.credentials
  } catch {
    // File doesn't exist or is invalid
    return null
  }
}

/**
 * Persist credentials to ~/.contentrain/credentials.json.
 *
 * Always enforces 0o600 file + 0o700 directory permissions on POSIX.
 */
export async function saveCredentials(credentials: StudioCredentials): Promise<void> {
  const dirPath = getCredentialsDir()
  const filePath = getCredentialsPath()

  // Ensure directory exists
  await mkdir(dirPath, { recursive: true })

  const config: StudioConfig = {
    version: 1,
    credentials,
  }

  const content = JSON.stringify(config, null, 2) + '\n'
  await writeFile(filePath, content, { encoding: 'utf-8', mode: FILE_MODE })

  // Enforce permissions explicitly (writeFile mode only applies on creation)
  await enforcePermissions(dirPath, filePath)
}

/**
 * Securely remove stored credentials.
 *
 * Defence in depth: overwrites file content with zeros before unlinking
 * to reduce the risk of recovery from filesystem snapshots.
 */
export async function clearCredentials(): Promise<void> {
  const filePath = getCredentialsPath()

  try {
    const info = await stat(filePath)
    // Overwrite with zeros before deleting
    await writeFile(filePath, Buffer.alloc(info.size), { encoding: 'utf-8' })
    await unlink(filePath)
  } catch {
    // File already absent — nothing to clear
  }
}

/**
 * Update only the default workspace/project IDs without touching tokens.
 */
export async function saveDefaults(
  workspaceId: string,
  projectId: string,
): Promise<void> {
  const credentials = await loadCredentials()
  if (!credentials) return

  credentials.defaultWorkspaceId = workspaceId
  credentials.defaultProjectId = projectId
  await saveCredentials(credentials)
}

/**
 * Check whether the credentials file has secure permissions.
 *
 * Returns a warning message if permissions are too open, or null if secure.
 * On Windows this always returns null (chmod is a no-op there).
 */
export async function checkPermissions(): Promise<string | null> {
  if (process.platform === 'win32') return null

  const filePath = getCredentialsPath()

  try {
    const info = await stat(filePath)
    // eslint-disable-next-line no-bitwise
    const mode = info.mode & 0o777
    if (mode !== FILE_MODE) {
      return (
        `Credentials file has insecure permissions (${modeToString(mode)}). `
        + `Expected ${modeToString(FILE_MODE)}. `
        + `Run: chmod 600 ${filePath}`
      )
    }
    return null
  } catch {
    // File doesn't exist — no warning needed
    return null
  }
}

/**
 * Check whether the stored token is expired.
 */
export function isTokenExpired(credentials: StudioCredentials): boolean {
  if (!credentials.expiresAt) return false
  return Date.now() >= new Date(credentials.expiresAt).getTime()
}

// ── Helpers ───────────────────────────────────────────────────────────────

async function enforcePermissions(dirPath: string, filePath: string): Promise<void> {
  if (process.platform === 'win32') return
  try {
    await chmod(dirPath, DIR_MODE)
    await chmod(filePath, FILE_MODE)
  } catch {
    // Best-effort — don't block the operation
  }
}

function modeToString(mode: number): string {
  return `0o${mode.toString(8)}`
}

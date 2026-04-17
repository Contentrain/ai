// ---------------------------------------------------------------------------
// Workspace / Project resolution for Studio commands.
//
// Resolution order:
//   1. Explicit CLI args (--workspace, --project)
//   2. Saved defaults from ~/.contentrain/credentials.json
//   3. Interactive prompt (fetch list → select)
// ---------------------------------------------------------------------------

import { select, confirm, isCancel } from '@clack/prompts'
import { loadCredentials, saveDefaults } from './auth/credential-store.js'
import type { StudioApiClient } from './client.js'

export interface StudioContext {
  workspaceId: string
  projectId: string
}

/**
 * Resolve workspace + project IDs for a Studio command.
 *
 * Falls back to interactive prompts when IDs are not provided via args
 * or saved defaults.
 */
export async function resolveStudioContext(
  client: StudioApiClient,
  args: { workspace?: string; project?: string },
): Promise<StudioContext | null> {
  const credentials = await loadCredentials()

  // ── Workspace ─────────────────────────────────────────────────────────
  let workspaceId = args.workspace ?? credentials?.defaultWorkspaceId

  if (!workspaceId) {
    const workspaces = await client.listWorkspaces()
    if (workspaces.length === 0) {
      return null
    }

    if (workspaces.length === 1) {
      workspaceId = workspaces[0]!.id
    } else {
      const choice = await select({
        message: 'Select workspace',
        options: workspaces.map(w => ({
          value: w.id,
          label: w.name,
          hint: w.plan,
        })),
      })
      if (isCancel(choice)) return null
      workspaceId = choice as string
    }
  }

  // ── Project ───────────────────────────────────────────────────────────
  let projectId = args.project ?? credentials?.defaultProjectId

  if (!projectId) {
    const projects = await client.listProjects(workspaceId)
    if (projects.length === 0) {
      return null
    }

    if (projects.length === 1) {
      projectId = projects[0]!.id
    } else {
      const choice = await select({
        message: 'Select project',
        options: projects.map(p => ({
          value: p.id,
          label: p.name,
          hint: p.stack,
        })),
      })
      if (isCancel(choice)) return null
      projectId = choice as string
    }
  }

  // ── Save defaults ─────────────────────────────────────────────────────
  const hasChanged =
    workspaceId !== credentials?.defaultWorkspaceId
    || projectId !== credentials?.defaultProjectId

  if (hasChanged && credentials) {
    const shouldSave = await confirm({
      message: 'Save as default workspace/project?',
    })
    if (!isCancel(shouldSave) && shouldSave) {
      await saveDefaults(workspaceId, projectId)
    }
  }

  return { workspaceId, projectId }
}

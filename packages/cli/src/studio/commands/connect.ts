import { defineCommand } from 'citty'
import { intro, outro, log, spinner, select, text, confirm, isCancel } from '@clack/prompts'
import { simpleGit } from 'simple-git'
import { pc } from '../../utils/ui.js'
import { openBrowser } from '../../utils/browser.js'
import { resolveStudioClient } from '../client.js'
import { startOAuthServer } from '../auth/oauth-server.js'
import { saveDefaults } from '../auth/credential-store.js'
import type { GitHubInstallation, GitHubRepo } from '../types.js'

export default defineCommand({
  meta: {
    name: 'connect',
    description: 'Connect this repository to a Contentrain Studio project',
  },
  args: {
    workspace: { type: 'string', description: 'Workspace ID', required: false },
    json: { type: 'boolean', description: 'JSON output', required: false },
  },
  async run({ args }) {
    if (!args.json) {
      intro(pc.bold('contentrain studio connect'))
    }

    try {
      // ── Stage 1: Authentication ─────────────────────────────────────────
      const client = await resolveStudioClient()

      // ── Stage 2: Workspace ──────────────────────────────────────────────
      const s1 = args.json ? null : spinner()
      s1?.start('Loading workspaces...')

      const workspaces = await client.listWorkspaces()
      s1?.stop(`${workspaces.length} workspace(s) found`)

      if (workspaces.length === 0) {
        log.warning('No workspaces found. Create one at studio.contentrain.io first.')
        outro('')
        return
      }

      let workspaceId = args.workspace
      if (!workspaceId) {
        if (workspaces.length === 1) {
          workspaceId = workspaces[0]!.id
          if (!args.json) {
            log.info(`Using workspace: ${pc.cyan(workspaces[0]!.name)}`)
          }
        } else {
          const choice = await select({
            message: 'Select workspace',
            options: workspaces.map(w => ({
              value: w.id,
              label: w.name,
              hint: w.plan,
            })),
          })
          if (isCancel(choice)) {
            outro(pc.dim('Cancelled'))
            return
          }
          workspaceId = choice as string
        }
      }

      const workspace = workspaces.find(w => w.id === workspaceId)!

      // ── Stage 3: GitHub App ─────────────────────────────────────────────
      const s2 = args.json ? null : spinner()
      s2?.start('Checking GitHub App installation...')

      let installations = await client.listGitHubInstallations()
      s2?.stop(
        installations.length > 0
          ? `${installations.length} GitHub installation(s) found`
          : 'No GitHub App installed',
      )

      if (installations.length === 0) {
        const shouldInstall = await confirm({
          message: 'The Contentrain GitHub App is required. Install it now?',
        })
        if (isCancel(shouldInstall) || !shouldInstall) {
          outro(pc.dim('Cancelled'))
          return
        }

        const setupData = await client.getGitHubSetupUrl()
        const oauth = await startOAuthServer()
        const installUrl = `${setupData.url}&redirect_uri=${encodeURIComponent(oauth.callbackUrl)}&state=${oauth.state}`

        if (!args.json) {
          log.info(`If the browser doesn't open, visit:\n  ${pc.cyan(installUrl)}`)
        }
        await openBrowser(installUrl)

        const s2b = args.json ? null : spinner()
        s2b?.start('Waiting for GitHub App installation...')

        try {
          const result = await oauth.waitForCallback()
          if (result.state !== oauth.state) {
            s2b?.stop('Failed')
            log.error('State mismatch. Please try again.')
            process.exitCode = 1
            outro('')
            return
          }
          s2b?.stop('GitHub App installed')
        } catch (error) {
          s2b?.stop('Failed')
          oauth.close()
          log.error(error instanceof Error ? error.message : String(error))
          process.exitCode = 1
          outro('')
          return
        }

        // Re-fetch installations after setup
        installations = await client.listGitHubInstallations()
        if (installations.length === 0) {
          log.error('GitHub App installation not detected. Please try again.')
          process.exitCode = 1
          outro('')
          return
        }
      }

      // Select installation
      let installation: GitHubInstallation

      if (installations.length === 1) {
        installation = installations[0]!
        if (!args.json) {
          log.info(`Using GitHub account: ${pc.cyan(installation.accountLogin)}`)
        }
      } else {
        const choice = await select({
          message: 'Select GitHub account',
          options: installations.map(inst => ({
            value: String(inst.id),
            label: inst.accountLogin,
            hint: inst.accountType,
          })),
        })
        if (isCancel(choice)) {
          outro(pc.dim('Cancelled'))
          return
        }
        installation = installations.find(i => String(i.id) === choice)!
      }

      // ── Stage 4: Repo Detection ────────────────────────────────────────
      const s3 = args.json ? null : spinner()
      s3?.start('Detecting git remote...')

      let detectedRepoFullName: string | null = null

      try {
        const git = simpleGit(process.cwd())
        const remotes = await git.getRemotes(true)
        const origin = remotes.find(r => r.name === 'origin')

        if (origin?.refs?.fetch) {
          detectedRepoFullName = parseGitHubRepoFromUrl(origin.refs.fetch)
        }
      } catch {
        // Not a git repo or no remotes — user can pick manually
      }

      const repos = await client.listGitHubRepos(installation.id)
      s3?.stop(
        detectedRepoFullName
          ? `Detected: ${pc.cyan(detectedRepoFullName)}`
          : `${repos.length} accessible repo(s)`,
      )

      let selectedRepo: GitHubRepo | null = null

      if (detectedRepoFullName) {
        const match = repos.find(r => r.fullName === detectedRepoFullName)
        if (match) {
          const useDetected = await confirm({
            message: `Connect to ${pc.cyan(match.fullName)}?`,
          })
          if (isCancel(useDetected)) {
            outro(pc.dim('Cancelled'))
            return
          }
          selectedRepo = useDetected ? match : await pickRepo(repos)
        } else {
          if (!args.json) {
            log.warning(`Detected remote "${detectedRepoFullName}" is not accessible to the GitHub App.`)
          }
          selectedRepo = await pickRepo(repos)
        }
      } else {
        if (repos.length === 0) {
          log.error('No repositories accessible. Grant the GitHub App access to your repos.')
          process.exitCode = 1
          outro('')
          return
        }
        selectedRepo = await pickRepo(repos)
      }

      if (!selectedRepo) {
        outro(pc.dim('Cancelled'))
        return
      }

      // ── Stage 5: Scan ──────────────────────────────────────────────────
      const s4 = args.json ? null : spinner()
      s4?.start('Scanning repository...')

      const scan = await client.scanRepository(installation.id, selectedRepo.fullName)
      s4?.stop(scan.hasContentrain ? 'Contentrain configuration found' : 'No Contentrain configuration found')

      if (!scan.hasContentrain) {
        if (!args.json) {
          log.warning('No .contentrain/ directory found in the repository.')
          log.info(`Run ${pc.cyan('contentrain init')} in your project first, then push to ${selectedRepo.defaultBranch}.`)
        }

        const proceed = await confirm({
          message: 'Continue anyway? (You can initialize later)',
        })
        if (isCancel(proceed) || !proceed) {
          outro(pc.dim('Cancelled'))
          return
        }
      } else if (!args.json) {
        log.info(`Found ${scan.models.length} model(s), ${scan.locales.length} locale(s)`)
      }

      // ── Stage 6: Create Project ────────────────────────────────────────
      const repoName = selectedRepo.fullName.split('/')[1] ?? selectedRepo.fullName

      const projectName = await text({
        message: 'Project name',
        initialValue: repoName,
        validate: (v) => {
          if (!v.trim()) return 'Name is required'
          return undefined
        },
      })
      if (isCancel(projectName)) {
        outro(pc.dim('Cancelled'))
        return
      }

      const s5 = args.json ? null : spinner()
      s5?.start('Creating project...')

      const project = await client.createProject(workspaceId, {
        name: projectName as string,
        installationId: installation.id,
        repositoryFullName: selectedRepo.fullName,
        defaultBranch: selectedRepo.defaultBranch,
      })

      s5?.stop('Project created')

      // Save defaults
      await saveDefaults(workspaceId, project.id)

      // ── Output ─────────────────────────────────────────────────────────
      if (args.json) {
        const output = {
          workspace: { id: workspace.id, name: workspace.name },
          project: { id: project.id, name: project.name },
          repository: selectedRepo.fullName,
          scan,
        }
        process.stdout.write(JSON.stringify(output, null, 2))
        return
      }

      log.success(pc.bold('Project connected!'))
      log.message('')
      log.message(`  Workspace:  ${pc.cyan(workspace.name)}`)
      log.message(`  Project:    ${pc.cyan(project.name)}`)
      log.message(`  Repository: ${pc.cyan(selectedRepo.fullName)}`)
      log.message(`  Branch:     ${selectedRepo.defaultBranch}`)
      log.message('')
      log.info('Next steps:')
      log.message(`  ${pc.cyan('contentrain studio status')}    — view project overview`)
      log.message(`  ${pc.cyan('contentrain studio cdn-init')}  — set up content delivery`)
      log.message(`  ${pc.cyan('contentrain studio webhooks')}  — configure webhooks`)
    } catch (error) {
      log.error(error instanceof Error ? error.message : String(error))
      process.exitCode = 1
    }

    if (!args.json) {
      outro('')
    }
  },
})

// ── Helpers ───────────────────────────────────────────────────────────────

/**
 * Parse owner/repo from a GitHub remote URL.
 * Handles both SSH (git@github.com:owner/repo.git) and HTTPS formats.
 */
export function parseGitHubRepoFromUrl(url: string): string | null {
  // SSH format: git@github.com:owner/repo.git
  const sshMatch = url.match(/github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/)
  if (sshMatch) return sshMatch[1]!

  // HTTPS format: https://github.com/owner/repo.git
  try {
    const parsed = new URL(url)
    if (parsed.hostname === 'github.com') {
      return parsed.pathname.replace(/^\//, '').replace(/\.git$/, '')
    }
  } catch {
    // Not a valid URL
  }

  return null
}

async function pickRepo(repos: GitHubRepo[]): Promise<GitHubRepo | null> {
  if (repos.length === 0) return null

  const choice = await select({
    message: 'Select repository',
    options: repos.map(r => ({
      value: r.fullName,
      label: r.fullName,
      hint: r.private ? 'private' : 'public',
    })),
  })
  if (isCancel(choice)) return null
  return repos.find(r => r.fullName === choice) ?? null
}

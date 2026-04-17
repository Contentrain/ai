import { defineCommand } from 'citty'
import { intro, outro, log, spinner, select, confirm, isCancel } from '@clack/prompts'
import { pc } from '../../utils/ui.js'
import { openBrowser } from '../../utils/browser.js'
import { loadCredentials, saveCredentials, checkPermissions } from '../auth/credential-store.js'
import { startOAuthServer } from '../auth/oauth-server.js'
import { StudioApiClient } from '../client.js'

const DEFAULT_STUDIO_URL = 'https://studio.contentrain.io'

export default defineCommand({
  meta: {
    name: 'login',
    description: 'Authenticate with Contentrain Studio',
  },
  args: {
    url: {
      type: 'string',
      description: 'Studio instance URL',
      required: false,
    },
    provider: {
      type: 'string',
      description: 'OAuth provider (github or google)',
      required: false,
    },
  },
  async run({ args }) {
    intro(pc.bold('contentrain studio login'))

    try {
      const studioUrl = (
        args.url
        ?? process.env['CONTENTRAIN_STUDIO_URL']
        ?? DEFAULT_STUDIO_URL
      ).replace(/\/+$/, '')

      // Check if already logged in
      const existing = await loadCredentials()
      if (existing) {
        const reAuth = await confirm({
          message: 'You are already logged in. Re-authenticate?',
        })
        if (isCancel(reAuth) || !reAuth) {
          outro(pc.dim('Cancelled'))
          return
        }
      }

      // Select OAuth provider
      let provider = args.provider
      if (!provider) {
        const choice = await select({
          message: 'Sign in with',
          options: [
            { value: 'github', label: 'GitHub' },
            { value: 'google', label: 'Google' },
          ],
        })
        if (isCancel(choice)) {
          outro(pc.dim('Cancelled'))
          return
        }
        provider = choice as string
      }

      // Start ephemeral OAuth callback server
      const s = spinner()
      s.start('Starting authentication...')

      const oauth = await startOAuthServer()

      // Build OAuth redirect URL
      const loginUrl = `${studioUrl}/api/auth/login`
        + `?provider=${provider}`
        + `&redirect_uri=${encodeURIComponent(oauth.callbackUrl)}`
        + `&state=${oauth.state}`

      s.stop('Opening browser...')

      // Open browser
      log.info(`If the browser doesn't open, visit:\n  ${pc.cyan(loginUrl)}`)
      await openBrowser(loginUrl)

      // Wait for callback
      const s2 = spinner()
      s2.start('Waiting for authentication...')

      let result
      try {
        result = await oauth.waitForCallback()
      } catch (error) {
        s2.stop('Failed')
        oauth.close()
        log.error(error instanceof Error ? error.message : String(error))
        process.exitCode = 1
        outro('')
        return
      }

      // Verify state parameter (CSRF protection)
      if (result.state !== oauth.state) {
        s2.stop('Failed')
        log.error('OAuth state mismatch. This could be a CSRF attack. Please try again.')
        process.exitCode = 1
        outro('')
        return
      }

      // Exchange code for tokens
      s2.stop('Exchanging token...')
      const s3 = spinner()
      s3.start('Completing authentication...')

      const verifyRes = await globalThis.fetch(`${studioUrl}/api/auth/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: result.code,
          state: result.state,
          redirectUri: oauth.callbackUrl,
        }),
      })

      if (!verifyRes.ok) {
        s3.stop('Failed')
        log.error('Token exchange failed. Please try again.')
        process.exitCode = 1
        outro('')
        return
      }

      const tokenData = await verifyRes.json() as {
        accessToken: string
        refreshToken: string
        expiresAt: string
      }

      // Save credentials securely
      await saveCredentials({
        studioUrl,
        accessToken: tokenData.accessToken,
        refreshToken: tokenData.refreshToken,
        expiresAt: tokenData.expiresAt,
      })

      // Verify by fetching user profile
      const client = new StudioApiClient({
        studioUrl,
        accessToken: tokenData.accessToken,
        refreshToken: tokenData.refreshToken,
        expiresAt: tokenData.expiresAt,
      })

      const user = await client.me()
      s3.stop('Authenticated')

      log.success(`Logged in as ${pc.bold(user.email)}`)

      // Permission check
      const permWarning = await checkPermissions()
      if (permWarning) {
        log.warning(permWarning)
      }
    } catch (error) {
      log.error(error instanceof Error ? error.message : String(error))
      process.exitCode = 1
    }

    outro('')
  },
})


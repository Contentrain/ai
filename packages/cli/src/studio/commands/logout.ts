import { defineCommand } from 'citty'
import { intro, outro, log } from '@clack/prompts'
import { pc } from '../../utils/ui.js'
import { loadCredentials, clearCredentials } from '../auth/credential-store.js'
import { StudioApiClient } from '../client.js'

export default defineCommand({
  meta: {
    name: 'logout',
    description: 'Log out from Contentrain Studio',
  },
  args: {},
  async run() {
    intro(pc.bold('contentrain studio logout'))

    const credentials = await loadCredentials()

    if (!credentials) {
      log.info('Not currently logged in.')
      outro('')
      return
    }

    // Best-effort server-side logout (don't block on failure)
    try {
      const client = new StudioApiClient(credentials)
      await client.logout()
    } catch {
      // Ignore — clearing local credentials is what matters
    }

    await clearCredentials()
    log.success('Logged out successfully.')

    outro('')
  },
})

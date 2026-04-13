import { defineCommand } from 'citty'

export default defineCommand({
  meta: {
    name: 'studio',
    description: 'Interact with Contentrain Studio',
  },
  subCommands: {
    login: () => import('./commands/login.js').then(m => m.default),
    logout: () => import('./commands/logout.js').then(m => m.default),
    whoami: () => import('./commands/whoami.js').then(m => m.default),
    connect: () => import('./commands/connect.js').then(m => m.default),
    status: () => import('./commands/status.js').then(m => m.default),
    activity: () => import('./commands/activity.js').then(m => m.default),
    usage: () => import('./commands/usage.js').then(m => m.default),
    branches: () => import('./commands/branches.js').then(m => m.default),
    'cdn-init': () => import('./commands/cdn-init.js').then(m => m.default),
    'cdn-build': () => import('./commands/cdn-build.js').then(m => m.default),
    webhooks: () => import('./commands/webhooks.js').then(m => m.default),
    submissions: () => import('./commands/submissions.js').then(m => m.default),
  },
})

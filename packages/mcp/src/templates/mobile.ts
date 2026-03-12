import type { ScaffoldTemplate } from '@contentrain/types'

export const mobileTemplate: ScaffoldTemplate = {
  id: 'mobile',
  models: [
    {
      id: 'app-strings',
      name: 'App Strings',
      kind: 'dictionary',
      domain: 'system',
      i18n: true,
    },
    {
      id: 'error-messages',
      name: 'Error Messages',
      kind: 'dictionary',
      domain: 'system',
      i18n: true,
    },
    {
      id: 'onboarding',
      name: 'Onboarding Screens',
      kind: 'collection',
      domain: 'app',
      i18n: true,
      fields: {
        title:       { type: 'string', required: true },
        description: { type: 'text' },
        image:       { type: 'image' },
        order:       { type: 'integer', required: true },
      },
    },
  ],
  sample_content: {
    'app-strings': {
      en: {
        'welcome': 'Welcome',
        'loading': 'Loading...',
        'retry': 'Retry',
        'ok': 'OK',
        'cancel': 'Cancel',
      },
    },
    'error-messages': {
      en: {
        'network-error': 'No internet connection',
        'server-error': 'Something went wrong',
        'auth-error': 'Please sign in again',
      },
    },
    onboarding: {
      en: {
        'step-1': { title: 'Welcome', description: 'Get started with our app', order: 1 },
        'step-2': { title: 'Discover', description: 'Explore all features', order: 2 },
        'step-3': { title: 'Ready', description: 'You are all set!', order: 3 },
      },
    },
  },
  vocabulary: {
    'get-started': { en: 'Get Started' },
    'skip':        { en: 'Skip' },
    'next':        { en: 'Next' },
  },
}

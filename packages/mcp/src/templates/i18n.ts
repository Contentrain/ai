import type { ScaffoldTemplate } from '@contentrain/types'

export const i18nTemplate: ScaffoldTemplate = {
  id: 'i18n',
  models: [
    {
      id: 'navigation',
      name: 'Navigation',
      kind: 'singleton',
      domain: 'ui',
      i18n: true,
      fields: {
        brand: { type: 'string', required: true },
        items: {
          type: 'array',
          items: {
            type: 'object',
            fields: {
              label: { type: 'string', required: true },
              url:   { type: 'url', required: true },
            },
          },
        },
      },
    },
    {
      id: 'form-labels',
      name: 'Form Labels',
      kind: 'singleton',
      domain: 'ui',
      i18n: true,
      fields: {
        name:     { type: 'string' },
        email:    { type: 'string' },
        password: { type: 'string' },
        submit:   { type: 'string' },
        cancel:   { type: 'string' },
      },
    },
    {
      id: 'error-messages',
      name: 'Error Messages',
      kind: 'dictionary',
      domain: 'system',
      i18n: true,
    },
    {
      id: 'app-strings',
      name: 'App Strings',
      kind: 'dictionary',
      domain: 'system',
      i18n: true,
    },
  ],
  sample_content: {
    navigation: {
      en: {
        brand: 'My App',
        items: [
          { label: 'Home', url: '/' },
          { label: 'About', url: '/about' },
          { label: 'Contact', url: '/contact' },
        ],
      },
    },
    'form-labels': {
      en: {
        name: 'Name',
        email: 'Email',
        password: 'Password',
        submit: 'Submit',
        cancel: 'Cancel',
      },
    },
    'error-messages': {
      en: {
        'required-field': 'This field is required',
        'invalid-email': 'Please enter a valid email',
        'server-error': 'Something went wrong, please try again',
      },
    },
    'app-strings': {
      en: {
        'welcome': 'Welcome',
        'loading': 'Loading...',
        'no-results': 'No results found',
      },
    },
  },
  vocabulary: {
    'language':      { en: 'Language' },
    'switch-locale': { en: 'Switch language' },
  },
}

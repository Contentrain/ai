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
      title_field: 'brand',
      fields: {
        brand: { type: 'string', required: true, label: 'Brand', order: 10 },
        items: {
          type: 'array',
          items: {
            type: 'object',
            fields: {
              label: { type: 'string', required: true, label: 'Label', order: 10 },
              url:   { type: 'url', required: true, label: 'URL', order: 20 },
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
      title_field: 'name',
      fields: {
        name:     { type: 'string', label: 'Name', order: 10 },
        email:    { type: 'string', label: 'Email', order: 20 },
        password: { type: 'string', label: 'Password', order: 30 },
        submit:   { type: 'string', label: 'Submit', order: 40 },
        cancel:   { type: 'string', label: 'Cancel', order: 50 },
      },
    },
    {
      id: 'error-messages',
      name: 'Error Messages',
      kind: 'dictionary',
      domain: 'system',
      i18n: true,
      title_field: 'key',
    },
    {
      id: 'app-strings',
      name: 'App Strings',
      kind: 'dictionary',
      domain: 'system',
      i18n: true,
      title_field: 'key',
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

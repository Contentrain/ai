/**
 * @contentrain/skills — AI agent skills for Contentrain
 *
 * Step-by-step workflow procedures and framework integration guides.
 */

// ─── Workflow Skills ───

export const WORKFLOW_SKILLS = [
  'contentrain-init',
  'contentrain-model',
  'contentrain-content',
  'contentrain-bulk',
  'contentrain-normalize',
  'contentrain-validate-fix',
  'contentrain-review',
  'contentrain-diff',
  'contentrain-doctor',
  'contentrain-serve',
  'contentrain-translate',
  'contentrain-generate',
] as const

export type WorkflowSkill = (typeof WORKFLOW_SKILLS)[number]

// ─── Framework Guides ───

export const FRAMEWORK_GUIDES = ['nuxt', 'next', 'astro', 'sveltekit', 'vue', 'react', 'expo', 'react-native', 'node'] as const
export type FrameworkGuide = (typeof FRAMEWORK_GUIDES)[number]

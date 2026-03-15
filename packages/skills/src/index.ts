/**
 * @contentrain/skills — AI agent skills for Contentrain
 *
 * Step-by-step workflow procedures and framework integration guides.
 */

// ─── Workflow Skills ───

export const WORKFLOW_SKILLS = [
  'contentrain-init',
  'contentrain-content',
  'contentrain-normalize',
  'contentrain-review',
  'contentrain-translate',
  'contentrain-generate',
] as const

export type WorkflowSkill = (typeof WORKFLOW_SKILLS)[number]

// ─── Framework Guides ───

export const FRAMEWORK_GUIDES = ['nuxt', 'next', 'astro', 'sveltekit'] as const
export type FrameworkGuide = (typeof FRAMEWORK_GUIDES)[number]

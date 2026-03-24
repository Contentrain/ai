/**
 * @contentrain/skills — AI agent skills for Contentrain
 *
 * Agent Skills standard format: SKILL.md + references/ for progressive disclosure.
 * Also includes workflow procedures and framework integration guides.
 */

// ─── Agent Skills Catalog ───

export const AGENT_SKILLS = [
  { name: 'contentrain', description: 'Contentrain CMS architecture, content formats, and MCP tool usage' },
  { name: 'contentrain-normalize', description: 'Two-phase normalize: extract hardcoded strings and patch source files' },
  { name: 'contentrain-quality', description: 'Content quality, SEO, accessibility, and media rules' },
  { name: 'contentrain-sdk', description: 'Query SDK usage: #contentrain imports, QueryBuilder, type-safe content access' },
  { name: 'contentrain-content', description: 'Create and manage content entries for existing models' },
  { name: 'contentrain-model', description: 'Design and save model definitions' },
  { name: 'contentrain-init', description: 'Initialize a new Contentrain project' },
  { name: 'contentrain-bulk', description: 'Batch operations on content entries' },
  { name: 'contentrain-validate-fix', description: 'Validate content and auto-fix structural issues' },
  { name: 'contentrain-review', description: 'Review content changes before publishing' },
  { name: 'contentrain-translate', description: 'Translate content across supported locales' },
  { name: 'contentrain-generate', description: 'Generate the typed SDK client from models' },
  { name: 'contentrain-serve', description: 'Start the local review and normalize UI' },
  { name: 'contentrain-diff', description: 'View content diffs between branches' },
  { name: 'contentrain-doctor', description: 'Diagnose project health issues' },
] as const

export type AgentSkillName = (typeof AGENT_SKILLS)[number]['name']

// ─── Workflow Skills (backward compat) ───

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

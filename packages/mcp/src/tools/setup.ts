import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ContentrainConfig, Vocabulary } from '@contentrain/types'
import { z } from 'zod'
import { join } from 'node:path'
import { readFile, writeFile, appendFile } from 'node:fs/promises'
import { simpleGit } from 'simple-git'
import { detectStack } from '../util/detect.js'
import { contentrainDir, ensureDir, pathExists, writeJson } from '../util/fs.js'
import { readConfig, readVocabulary } from '../core/config.js'
import { writeModel } from '../core/model-manager.js'
import { writeContent, type ContentEntry } from '../core/content-manager.js'
import { getTemplate, listTemplates } from '../templates/index.js'
import { createTransaction, buildBranchName, ensureContentBranch } from '../git/transaction.js'
import { checkBranchHealth } from '../git/branch-lifecycle.js'

export function registerSetupTools(server: McpServer, projectRoot: string): void {
  // ─── contentrain_init ───
  server.tool(
    'contentrain_init',
    'Initialize .contentrain/ structure. Changes are auto-committed to git — do NOT manually create .contentrain/ files.',
    {
      stack: z.string().optional().describe('Framework stack (nuxt, next, astro, svelte, react-vite, other). Auto-detected if omitted.'),
      locales: z.array(z.string()).optional().describe('Supported locales. Default: ["en"]'),
      domains: z.array(z.string()).optional().describe('Content domains. Default: auto-suggested'),
    },
    async ({ stack, locales, domains }) => {
      const crDir = contentrainDir(projectRoot)

      // Already initialized?
      if (await pathExists(join(crDir, 'config.json'))) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({
            error: 'Already initialized',
            suggestion: 'Use contentrain_status to see current state',
          }) }],
          isError: true,
        }
      }

      // Detect stack
      const detectedStack = stack ?? await detectStack(projectRoot)
      const supportedLocales = locales ?? ['en']
      const suggestedDomains = domains ?? suggestDomains(projectRoot)

      // Ensure .git exists
      const hasGit = await pathExists(join(projectRoot, '.git'))
      if (!hasGit) {
        await simpleGit(projectRoot).init()
      }

      // Branch health gate
      const initHealth = await checkBranchHealth(projectRoot)
      if (initHealth.blocked) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({
            error: initHealth.message,
            action: 'blocked',
            hint: 'Merge or delete old contentrain/* branches before creating new ones.',
          }, null, 2) }],
          isError: true,
        }
      }

      // Create git transaction
      const branch = buildBranchName('new', 'init')
      const tx = await createTransaction(projectRoot, branch)

      try {
        await tx.write(async (wt) => {
          const wtCrDir = join(wt, '.contentrain')

          // Create directories with .gitkeep so git tracks them
          await Promise.all(['models', 'content', 'meta'].map(async (dir) => {
            await ensureDir(join(wtCrDir, dir))
            await writeFile(join(wtCrDir, dir, '.gitkeep'), '', 'utf-8')
          }))

          // Write config
          const config: ContentrainConfig = {
            version: 1,
            stack: detectedStack as ContentrainConfig['stack'],
            workflow: 'auto-merge',
            locales: {
              default: supportedLocales[0] ?? 'en',
              supported: supportedLocales,
            },
            domains: suggestedDomains,
          }
          await writeJson(join(wtCrDir, 'config.json'), config)

          // Write empty vocabulary
          const vocabulary: Vocabulary = { version: 1, terms: {} }
          await writeJson(join(wtCrDir, 'vocabulary.json'), vocabulary)

          // Write initial context
          await writeJson(join(wtCrDir, 'context.json'), {
            version: '1',
            lastOperation: {
              tool: 'contentrain_init',
              model: '',
              locale: supportedLocales[0] ?? 'en',
              timestamp: new Date().toISOString(),
              source: process.env['CONTENTRAIN_SOURCE'] === 'mcp-studio' ? 'mcp-studio' : 'mcp-local',
            },
            stats: { models: 0, entries: 0, locales: supportedLocales, lastSync: new Date().toISOString() },
          })

          // Update .gitignore
          await updateGitignore(wt)
        })

        await tx.commit('[contentrain] init: project setup', {
          tool: 'contentrain_init',
          model: '',
          locale: supportedLocales[0] ?? 'en',
        })
        const gitResult = await tx.complete()

        // Ensure the contentrain branch exists after init
        await ensureContentBranch(projectRoot)

        return {
          content: [{ type: 'text' as const, text: JSON.stringify({
            status: 'committed',
            message: 'Project initialized and committed to git. Do NOT manually edit .contentrain/ files.',
            config_created: '.contentrain/config.json',
            detected_stack: detectedStack,
            detected_locales: supportedLocales,
            suggested_domains: suggestedDomains,
            files_created: [
              '.contentrain/config.json',
              '.contentrain/vocabulary.json',
              '.contentrain/context.json',
            ],
            directories_created: [
              '.contentrain/models/',
              '.contentrain/content/',
              '.contentrain/meta/',
            ],
            gitignore_updated: true,
            git: { branch, action: gitResult.action, commit: gitResult.commit, ...(gitResult.sync ? { sync: gitResult.sync } : {}) },
            next_steps: [
              'Create models with contentrain_model_save or contentrain_scaffold',
              'Use contentrain_scan to find hardcoded strings',
            ],
          }, null, 2) }],
        }
      } catch (error) {
        await tx.cleanup()
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({
            error: `Init failed: ${error instanceof Error ? error.message : String(error)}`,
          }) }],
          isError: true,
        }
      } finally {
        await tx.cleanup()
      }
    },
  )

  // ─── contentrain_scaffold ───
  server.tool(
    'contentrain_scaffold',
    `Template-based project setup. Available templates: ${listTemplates().join(', ')}. Changes are auto-committed to git.`,
    {
      template: z.string().describe('Template ID: blog, landing, docs, ecommerce, saas, i18n, mobile'),
      locales: z.array(z.string()).optional().describe('Override locales'),
      with_sample_content: z.boolean().optional().default(true).describe('Include sample content (default: true)'),
    },
    async ({ template: templateId, locales, with_sample_content }) => {
      const config = await readConfig(projectRoot)
      if (!config) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({
            error: 'Project not initialized. Run contentrain_init first.',
          }) }],
          isError: true,
        }
      }

      const tmpl = getTemplate(templateId)
      if (!tmpl) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({
            error: `Unknown template: "${templateId}". Available: ${listTemplates().join(', ')}`,
          }) }],
          isError: true,
        }
      }

      // Branch health gate
      const scaffoldHealth = await checkBranchHealth(projectRoot)
      if (scaffoldHealth.blocked) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({
            error: scaffoldHealth.message,
            action: 'blocked',
            hint: 'Merge or delete old contentrain/* branches before creating new ones.',
          }, null, 2) }],
          isError: true,
        }
      }

      const effectiveLocales = locales ?? config.locales.supported
      const defaultLocale = effectiveLocales[0] ?? 'en'

      const branch = buildBranchName('new', `scaffold-${templateId}`, defaultLocale)
      const tx = await createTransaction(projectRoot, branch)

      try {
        const modelsCreated: Array<{ id: string; kind: string; fields: number }> = []
        let contentCreated = 0
        let vocabAdded = 0

        await tx.write(async (wt) => {
          // Write models
          await Promise.all(tmpl.models.map(async (model) => {
            await writeModel(wt, model)
            modelsCreated.push({
              id: model.id,
              kind: model.kind,
              fields: model.fields ? Object.keys(model.fields).length : 0,
            })
          }))

          // Write sample content via content pipeline (handles content_path, locale_strategy, meta)
          if (with_sample_content && tmpl.sample_content) {
            contentCreated = await writeSampleContent(wt, tmpl, effectiveLocales, config)
          }

          // Merge vocabulary
          if (tmpl.vocabulary) {
            vocabAdded = await mergeVocabulary(wt, tmpl.vocabulary, effectiveLocales)
          }

        })

        await tx.commit(`[contentrain] scaffold: ${templateId} (${defaultLocale})`, {
          tool: 'contentrain_scaffold',
          model: tmpl.models.map(m => m.id).join(', '),
          locale: defaultLocale,
        })
        const gitResult = await tx.complete()

        return {
          content: [{ type: 'text' as const, text: JSON.stringify({
            status: 'committed',
            message: 'Scaffold applied and committed to git. Do NOT manually edit .contentrain/ files.',
            models_created: modelsCreated,
            content_created: contentCreated,
            vocabulary_terms_added: vocabAdded,
            git: { branch, action: gitResult.action, commit: gitResult.commit, ...(gitResult.sync ? { sync: gitResult.sync } : {}) },
            context_updated: true,
            next_steps: [
              'Customize models with contentrain_model_save',
              'Add content with contentrain_content_save',
              'Run contentrain_submit when ready',
            ],
          }, null, 2) }],
        }
      } catch (error) {
        await tx.cleanup()
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({
            error: `Scaffold failed: ${error instanceof Error ? error.message : String(error)}`,
          }) }],
          isError: true,
        }
      } finally {
        await tx.cleanup()
      }
    },
  )
}

function suggestDomains(_projectRoot: string): string[] {
  return ['marketing', 'blog', 'system']
}

async function updateGitignore(projectRoot: string): Promise<void> {
  const gitignorePath = join(projectRoot, '.gitignore')
  const cacheEntry = '.contentrain/.cache/'

  if (await pathExists(gitignorePath)) {
    const content = await readFile(gitignorePath, 'utf-8')
    if (!content.includes(cacheEntry)) {
      await appendFile(gitignorePath, `\n# Contentrain cache\n${cacheEntry}\n`)
    }
  } else {
    await writeFile(gitignorePath, `# Contentrain cache\n${cacheEntry}\n`, 'utf-8')
  }
}

async function writeSampleContent(
  worktreePath: string,
  tmpl: import('@contentrain/types').ScaffoldTemplate,
  locales: string[],
  config: import('@contentrain/types').ContentrainConfig,
): Promise<number> {
  if (!tmpl.sample_content) return 0

  let count = 0

  for (const model of tmpl.models) {
    const sampleData = tmpl.sample_content[model.id]
    if (!sampleData) continue

    for (const [localeOrKey, data] of Object.entries(sampleData)) {
      const entryMap = data as Record<string, Record<string, unknown>>
      let targetLocale: string
      if (localeOrKey === 'data') {
        targetLocale = locales[0] ?? 'en'
      } else if (locales.includes(localeOrKey)) {
        targetLocale = localeOrKey
      } else {
        continue
      }

      // Convert template payload to ContentEntry[] based on model kind
      let entries: ContentEntry[]

      if (model.kind === 'singleton' || model.kind === 'dictionary') {
        // Singleton/dictionary: the entire locale object IS the data for one entry
        entries = [{ locale: targetLocale, data: entryMap as Record<string, unknown> }]
      } else if (model.kind === 'document') {
        // Document: keys are slugs, values are frontmatter objects
        entries = Object.entries(entryMap).map(([slug, fields]) => ({
          slug,
          locale: targetLocale,
          data: fields,
        }))
      } else {
        // Collection: keys are entry IDs, values are field objects
        entries = Object.entries(entryMap).map(([id, fields]) => ({
          id,
          locale: targetLocale,
          data: fields,
        }))
      }

      await writeContent(worktreePath, model, entries, config)
      count += entries.length
    }
  }

  return count
}

async function mergeVocabulary(
  projectRoot: string,
  newTerms: Record<string, Record<string, string>>,
  _locales: string[],
): Promise<number> {
  const vocabPath = join(contentrainDir(projectRoot), 'vocabulary.json')
  const existing = await readVocabulary(projectRoot)
  const vocab: Vocabulary = existing ?? { version: 1, terms: {} }

  let added = 0
  for (const [key, translations] of Object.entries(newTerms)) {
    if (!(key in vocab.terms)) {
      added++
    }
    vocab.terms[key] = { ...vocab.terms[key], ...translations }
  }

  await writeJson(vocabPath, vocab)
  return added
}

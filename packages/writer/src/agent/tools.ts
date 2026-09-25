// The agent's whole tool surface: an in-process MCP server. Built-in tools
// (shell, file edit, web) are switched off for the agent, so these are the
// only things it can do — read the plan, the catalog and the template it is
// working on, read and write project files through the guard, build, compare
// its page with the source, and run the gates.

import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import type { KitCatalog } from '@contentrain/astro-kit'
import type { ProjectPlan } from '@contentrain/types'
import { z } from 'zod'
import { findTemplate, representativePath, WIDTHS, type FactsView, type Width } from '../facts.js'
import { GuardError, readablePath, writablePath } from '../guard.js'
import { build, gates } from '../project.js'
import type { Shooter } from '../shoot.js'
import { compare, crop, readPng, type Box } from '../visual.js'

export const SERVER_NAME = 'writer'

export interface ToolContext {
  /** The project being written. */
  root: string
  plan: ProjectPlan
  catalog: KitCatalog
  facts: FactsView
  /** Directory facts.json lives in; render paths are relative to it. */
  factsDir: string
  shooter: Shooter
  /** Every file the agent wrote, project-relative — the run report lists them. */
  written: Set<string>
}

type Content = { type: 'text', text: string } | { type: 'image', data: string, mimeType: string }
const text = (value: string) => ({ content: [{ type: 'text', text: value }] as Content[] })
const json = (value: unknown) => text(JSON.stringify(value, null, 2))
const refuse = (message: string) => ({ content: [{ type: 'text', text: message }] as Content[], isError: true })

/** Run a handler; a guard or input error goes back to the model as an error result, not a crash. */
async function guarded<T>(fn: () => Promise<T>): Promise<T | ReturnType<typeof refuse>> {
  try {
    return await fn()
  } catch (error) {
    if (error instanceof GuardError) return refuse(`Refused: ${error.message}`)
    return refuse(error instanceof Error ? error.message : String(error))
  }
}

/** Box of a region at a width: the 1280 box, scaled horizontally for narrower renders. */
function regionBox(box: Box, width: Width): Box {
  if (width === 1280) return box
  const scale = width / 1280
  return [box[0] * scale, box[1], box[2] * scale, box[3]]
}

export function writerTools(ctx: ToolContext) {
  return [
    tool('plan_read', 'The project plan: site settings, models, components, routes and their sections. Read it first.', {
      part: z.enum(['all', 'site', 'models', 'components', 'routes', 'layout']).default('all').describe('Which part of the plan to return.'),
    }, async ({ part }) => json(part === 'all' ? ctx.plan : ctx.plan[part])),

    tool('catalog_query', 'Kit components: props (Contentrain field definitions), variants, slots, JavaScript, the builder elements each replaces. Filter by id, category or builder element.', {
      id: z.string().optional().describe('A kit component id, e.g. "hero".'),
      category: z.enum(['chrome', 'section', 'content', 'primitive']).optional(),
      source: z.string().optional().describe('A builder element, e.g. "core/cover" or "elementor/icon-box".'),
    }, async ({ id, category, source }) => {
      const found = ctx.catalog.components.filter(c =>
        (!id || c.id === id)
        && (!category || c.category === category)
        && (!source || Object.values(c.sources).some(names => names?.includes(source))))
      return json({ tokens: ctx.catalog.tokens, components: found })
    }),

    tool('template_facts', 'What the source site shows for a template: its regions (name, path, box at 1280) and, for one region or the whole page, the source screenshot at a width.', {
      template: z.string().describe('Fact template id (PlanRoute.template or a site component brief template).'),
      region: z.string().optional().describe('Region path from the regions list; omit for the regions list only.'),
      width: z.union([z.literal(390), z.literal(768), z.literal(1280)]).default(1280),
    }, async ({ template: id, region, width }) => guarded(async () => {
      const template = findTemplate(ctx.facts, id)
      const summary = { id: template.id, kinds: template.kinds, representative: representativePath(template), pages: template.pages.length, regions: template.regions }
      if (!region) return json(summary)
      const r = template.regions.find(candidate => candidate.path === region)
      if (!r) return refuse(`template ${id} has no region "${region}"`)
      const render = template.renders[String(width) as `${Width}`]
      if (!render) return refuse(`template ${id} has no render at ${width}px`)
      const source = crop(await readPng(join(ctx.factsDir, render.screenshot)), regionBox(r.box, width))
      const { PNG } = await import('pngjs')
      return {
        content: [
          { type: 'text', text: `Source region ${region} (${r.name ?? r.tag}) of ${id} at ${width}px:` },
          { type: 'image', data: PNG.sync.write(source).toString('base64'), mimeType: 'image/png' },
        ] as Content[],
      }
    })),

    tool('file_list', 'Files under a project directory (not content entries).', {
      dir: z.string().default('src').describe('Project-relative directory.'),
    }, async ({ dir }) => guarded(async () => {
      const absolute = await readablePath(ctx.root, dir)
      const entries = await readdir(absolute, { recursive: true, withFileTypes: true })
      return text(entries.filter(e => e.isFile()).map(e => relative(ctx.root, join(e.parentPath, e.name))).toSorted().join('\n'))
    })),

    tool('file_read', 'Read a project file: views, components, styles, models (.contentrain/models/). Content entries are not readable — bind props to fields instead.', {
      path: z.string().describe('Project-relative path.'),
    }, async ({ path }) => guarded(async () => text(await readFile(await readablePath(ctx.root, path), 'utf8')))),

    tool('file_write', 'Write a whole file. Only src/views/, src/components/site/ and src/styles/site.css are writable; content is never written.', {
      path: z.string().describe('Project-relative path.'),
      content: z.string().describe('The complete file.'),
    }, async ({ path, content }) => guarded(async () => {
      const absolute = await writablePath(ctx.root, path)
      await mkdir(dirname(absolute), { recursive: true })
      await writeFile(absolute, content)
      ctx.written.add(relative(ctx.root, absolute))
      return text(`wrote ${relative(ctx.root, absolute)} (${content.length} chars)`)
    })),

    tool('build', 'Type-check (astro check, strictest) and build the site. Run after writing; fix every error it reports.', {}, async () => {
      const result = await build(ctx.root)
      return result.ok ? text(result.output) : refuse(result.output)
    }),

    tool('visual_diff', 'Compare the built page of a template with the source, for one region or the whole page, at one width. Returns both crops and a score. Build first.', {
      template: z.string(),
      region: z.string().optional().describe('Region path; omit for the full page.'),
      width: z.union([z.literal(390), z.literal(768), z.literal(1280)]).default(1280),
    }, async ({ template: id, region, width }) => guarded(async () => {
      const template = findTemplate(ctx.facts, id)
      const render = template.renders[String(width) as `${Width}`]
      if (!render) return refuse(`template ${id} has no render at ${width}px`)
      let source = await readPng(join(ctx.factsDir, render.screenshot))
      let output = await ctx.shooter.shoot(representativePath(template), width)
      if (region) {
        const r = template.regions.find(candidate => candidate.path === region)
        if (!r) return refuse(`template ${id} has no region "${region}"`)
        const box = regionBox(r.box, width)
        source = crop(source, box)
        output = crop(output, box)
      }
      const result = compare(source, output)
      return {
        content: [
          { type: 'text', text: `score ${result.score} for ${id}${region ? ` region ${region}` : ''} at ${width}px (1 = identical). Source, then output:` },
          { type: 'image', data: result.source.toString('base64'), mimeType: 'image/png' },
          { type: 'image', data: result.output.toString('base64'), mimeType: 'image/png' },
        ] as Content[],
      }
    })),

    tool('gates', 'Run the gates beyond the build: knip (no unused code) and the built-site checks (one stylesheet, no WordPress runtime, SEO files, per-page title/lang/canonical/JSON-LD).', {}, async () => {
      const result = await gates(ctx.root)
      return result.ok ? text(result.output) : refuse(result.output)
    }),
  ]
}

export const WRITER_TOOL_NAMES = ['plan_read', 'catalog_query', 'template_facts', 'file_list', 'file_read', 'file_write', 'build', 'visual_diff', 'gates'] as const

/** Tool names as the agent sees them (`mcp__writer__file_write`). */
export const qualifiedToolNames = (names: readonly string[] = WRITER_TOOL_NAMES) => names.map(name => `mcp__${SERVER_NAME}__${name}`)

export function writerServer(ctx: ToolContext) {
  return createSdkMcpServer({ name: SERVER_NAME, version: '0.0.0', tools: writerTools(ctx) })
}

export { WIDTHS }

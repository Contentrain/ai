// The writer as the migration worker calls it. The deterministic generator
// writes the project around the imported store; what it cannot express (site
// components, routes it refuses) and what the gates failed on become agent
// jobs, run within the worker's budget and time. With nothing left for a
// model — or in a dry run — no model is called at all.

import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { KIT_COMPONENTS_DIR, loadCatalog, type KitCatalog } from '@contentrain/astro-kit'
import type { PlanComponent, ProjectPlan } from '@contentrain/types'
import { DEFAULT_MODELS, runWriter, type RunReport, type WriterJob } from './agent/run.js'
import type { ToolContext } from './agent/tools.js'
import type { RunBudget } from './budget.js'
import type { FactsView } from './facts.js'
import { generateProject, readModels, type GenerateReport } from './generate/index.js'
import { seoContentFiles, titleTemplateOf, type FactsSeo } from './generate/seo.js'
import { runCommand } from './project.js'
import { Shooter } from './shoot.js'

/** A gate failure the worker hands back for a repair pass (t6's `GateReport.failures[]`). */
export interface GateFailure {
  gate: string
  component?: string
  file?: string
  detail: string
}

export interface WriteProjectInput {
  plan: ProjectPlan
  facts: FactsView
  /** Directory of facts.json; render paths are relative to it. */
  factsDir: string
  /** Holds the imported `.contentrain` (wp-import, media, sections); the project is written around it. */
  projectDir: string
  /** A repair pass: only these failures are worked on, the generator does not run again. */
  feedback?: GateFailure[]
  /** Generate and plan the jobs, call no model. */
  dryRun?: boolean
}

export interface WriteContext {
  apiKey: string
  budget: RunBudget
  signal: AbortSignal
  log: (line: string) => void
  models?: { write: string, repair: string }
  concurrency?: number
}

export interface WriterReport {
  durationMs: number
  costUsd: number
  /** Per model: input, output, cache read and cache write tokens, and dollars. */
  models: Record<string, { input: number, output: number, cacheRead: number, cacheWrite: number, costUsd: number }>
  generated?: GenerateReport
  /** Agent jobs: planned (dry run) or run, with their outcome. */
  jobs: Array<{ id: string, role: 'write' | 'repair', reason: string, outcome?: string, costUsd?: number, turns?: number }>
  /** Files the agent wrote. */
  agentWritten: string[]
  /** Kit placements vs site components — the kit reuse rate the blind comparison measures. */
  kitReuse: { kitComponents: number, siteComponents: number }
  /** The source's title pattern and how many entries got its hand-written SEO values. */
  seo?: { titleTemplate: string, entries: number }
  /** unmapped_element decisions below the floor: written as site components, not kit guesses. */
  lowConfidence: number
}

/** The starter the package ships (`starter/`), or the monorepo's while developing. */
export function starterDir(): string {
  const here = dirname(fileURLToPath(import.meta.url))
  const bundled = join(here, '..', 'starter')
  return existsSync(bundled) ? bundled : join(here, '..', '..', '..', 'templates', 'astro-starter')
}

const siteComponentJob = (component: PlanComponent): WriterJob & { reason: string } => ({
  id: `component:${component.id}`,
  role: 'write',
  reason: 'site component',
  prompt: [
    `Write the site component ${component.id} at src/components/site/${component.id}.astro and place it where the plan's routes use it.`,
    `Props (Contentrain field definitions): ${JSON.stringify(component.props ?? {})}`,
    component.covers?.length ? `It stands for these source elements: ${component.covers.join(', ')}.` : '',
    component.brief ? `Source: template ${component.brief.template}, regions ${component.brief.regions.join(', ') || '(whole page)'}.${component.brief.notes ? ` Notes: ${component.brief.notes}` : ''}` : '',
    'Compare it with the source at 1280, 768 and 390 before you finish.',
  ].filter(Boolean).join('\n'),
})

const routeJob = (route: string, reason: string, plan: ProjectPlan): WriterJob & { reason: string } => ({
  id: `route:${route}`,
  role: 'write',
  reason,
  prompt: [
    `The generator could not write the view for plan route "${route}": ${reason}.`,
    `Route: ${JSON.stringify(plan.routes.find(r => r.id === route))}`,
    'Write it under src/views/ from the route\'s placements, binding every prop to content as the placement says, and register a composed page view in src/views/composed/index.ts by the WordPress ids it renders.',
  ].join('\n'),
})

/** Repair jobs: one per failing component or file; failures that name neither share one job. */
export function repairJobs(feedback: readonly GateFailure[]): Array<WriterJob & { reason: string }> {
  const groups = new Map<string, GateFailure[]>()
  for (const failure of feedback) {
    const key = failure.component ? `component:${failure.component}` : failure.file ? `file:${failure.file}` : 'site'
    ;(groups.get(key) ?? groups.set(key, []).get(key)!).push(failure)
  }
  return [...groups].map(([key, failures]) => ({
    id: `repair:${key}`,
    role: 'repair',
    reason: failures.map(f => f.gate).filter((gate, i, all) => all.indexOf(gate) === i).join(', '),
    prompt: [
      `The gates failed on ${key === 'site' ? 'the site' : key}. Fix only that; leave every other file as it is.`,
      ...failures.map(f => `- ${f.gate}${f.file ? ` (${f.file})` : ''}: ${f.detail}`),
      'Build, check the regions you touch with visual_diff, and run the gates before you finish.',
    ].join('\n'),
  }))
}

export async function writeProject(input: WriteProjectInput, ctx: WriteContext): Promise<{ files: string[], stopped?: 'budget' | 'time', notes?: string[], report: WriterReport }> {
  const started = Date.now()
  const { plan, projectDir } = input
  const catalog: KitCatalog = await loadCatalog()
  const notes: string[] = []

  let generated: GenerateReport | undefined
  let jobs: Array<WriterJob & { reason: string }>
  let seoReport: WriterReport['seo']
  if (input.feedback) {
    jobs = repairJobs(input.feedback)
  } else {
    ctx.log('writer: generating the project from the plan')
    const seoFacts = input.facts as unknown as FactsSeo
    const titleTemplate = titleTemplateOf(seoFacts)
    generated = await generateProject({ plan, catalog, kitRoot: KIT_COMPONENTS_DIR, starterDir: starterDir(), outDir: projectDir, titleTemplate })
    // The source's per-page titles and descriptions, copied from the fact pack into the entries' seo fields.
    const models = await readModels(join(projectDir, '.contentrain', 'models'))
    const seo = await seoContentFiles(projectDir, models, seoFacts, titleTemplate)
    for (const [path, text] of Object.entries(seo.files)) {
      await writeFile(join(projectDir, path), text)
      generated.written.push(path)
    }
    seoReport = { titleTemplate, entries: seo.entries }
    jobs = [
      ...plan.components.filter(c => c.origin === 'site').map(siteComponentJob),
      ...generated.routes.unsupported.map(u => routeJob(u.route, u.reason, plan)),
    ]
    ctx.log(`writer: ${generated.written.length} files generated, ${generated.routes.views.length} composed views, ${jobs.length} agent job(s)`)
  }

  const kitReuse = { kitComponents: plan.components.filter(c => c.origin === 'kit').length, siteComponents: plan.components.filter(c => c.origin === 'site').length }
  const report: WriterReport = {
    durationMs: 0,
    costUsd: 0,
    models: {},
    ...(generated ? { generated } : {}),
    ...(seoReport ? { seo: seoReport } : {}),
    jobs: jobs.map(j => ({ id: j.id, role: j.role, reason: j.reason })),
    agentWritten: [],
    kitReuse,
    lowConfidence: generated?.lowConfidence.length ?? 0,
  }
  const files = [...(generated?.written ?? [])]

  if (!jobs.length || input.dryRun) {
    if (input.dryRun && jobs.length) notes.push(`dry run: ${jobs.length} agent job(s) not run`)
    report.durationMs = Date.now() - started
    return { files, ...(notes.length ? { notes } : {}), report }
  }

  // The agent builds as it works: the project's dependencies first, installed without the worker's secrets.
  if (!existsSync(join(projectDir, 'node_modules'))) {
    ctx.log('writer: installing the project')
    const installed = await runCommand(projectDir, 'pnpm', ['install', '--no-frozen-lockfile'], 600_000)
    if (!installed.ok) throw new Error(`writer: pnpm install failed\n${installed.output}`)
  }
  const shooter = new Shooter(join(projectDir, 'dist'))
  const context: ToolContext = { root: projectDir, plan, catalog, facts: input.facts, factsDir: input.factsDir, shooter, written: new Set() }
  let run: RunReport
  try {
    run = await runWriter({
      jobs,
      context,
      apiKey: ctx.apiKey,
      budget: ctx.budget,
      signal: ctx.signal,
      budgetUsd: ctx.budget.remainingUsd(),
      models: ctx.models ?? DEFAULT_MODELS,
      concurrency: ctx.concurrency ?? 3,
      log: ctx.log,
    })
  } finally {
    await shooter.close()
  }

  for (const job of run.jobs) {
    const entry = report.jobs.find(j => j.id === job.id)
    if (entry) Object.assign(entry, { outcome: job.outcome, costUsd: job.costUsd, turns: job.turns })
    for (const [model, u] of Object.entries(job.usage)) {
      const total = report.models[model] ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, costUsd: 0 }
      report.models[model] = { input: total.input + u.input, output: total.output + u.output, cacheRead: total.cacheRead + u.cacheRead, cacheWrite: total.cacheWrite + u.cacheWrite, costUsd: total.costUsd + u.costUsd }
    }
    if (job.denied.length) notes.push(`job ${job.id}: refused tools ${job.denied.join(', ')}`)
  }
  report.costUsd = run.costUsd
  report.agentWritten = run.written
  report.durationMs = Date.now() - started
  for (const path of run.written) if (!files.includes(path)) files.push(path)
  return { files: files.toSorted(), ...(run.stopped ? { stopped: run.stopped } : {}), ...(notes.length ? { notes } : {}), report }
}

/** Read a plan and facts from disk: the CLI's and the acceptance run's entry. */
export async function readInputs(planPath: string, factsPath: string): Promise<{ plan: ProjectPlan, facts: FactsView }> {
  const [plan, facts] = await Promise.all([readFile(planPath, 'utf8'), readFile(factsPath, 'utf8')])
  return { plan: JSON.parse(plan) as ProjectPlan, facts: JSON.parse(facts) as FactsView }
}

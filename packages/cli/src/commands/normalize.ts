import { defineCommand } from 'citty'
import { intro, outro, log, spinner, select, multiselect, confirm, text, isCancel } from '@clack/prompts'
import { buildGraph } from '@contentrain/mcp/core/graph-builder'
import { scanSummary, scanCandidates } from '@contentrain/mcp/core/scanner'
import { applyExtract, applyReuse } from '@contentrain/mcp/core/apply-manager'
import type { ExtractionEntry, PatchEntry } from '@contentrain/mcp/core/apply-manager'
import { resolveProjectRoot, loadProjectContext, requireInitialized } from '../utils/context.js'
import { pc, formatCount } from '../utils/ui.js'

interface ApprovedCandidate {
  file: string
  line: number
  value: string
  context: string
}

export default defineCommand({
  meta: {
    name: 'normalize',
    description: 'Extract hardcoded strings into content models',
  },
  args: {
    root: { type: 'string', description: 'Project root path', required: false },
    'skip-graph': { type: 'boolean', description: 'Skip graph analysis', required: false },
    'dry-run': { type: 'boolean', description: 'Preview only, no changes', required: false },
    // json: TODO — structured output mode for CI (not yet implemented)
  },
  async run({ args }) {
    const projectRoot = await resolveProjectRoot(args.root)
    const ctx = await loadProjectContext(projectRoot)
    requireInitialized(ctx)

    intro(pc.bold('contentrain normalize'))

    // ─── Step 1: Graph Analysis ───
    let highValuePaths: string[] | undefined

    if (!args['skip-graph']) {
      const s = spinner()
      s.start('Analyzing project structure...')

      try {
        const graph = await buildGraph(projectRoot)
        s.stop('Project structure analyzed')

        log.info(pc.bold('Project Graph'))
        log.message(`  Pages:      ${graph.stats.total_pages}`)
        log.message(`  Components: ${graph.stats.total_components}`)
        log.message(`  Strings:    ~${graph.stats.total_strings_estimate}`)

        // Identify high-value files (pages + components with most strings)
        const allNodes = [...graph.pages, ...graph.components, ...graph.layouts]
        const nodesWithStrings = allNodes
          .filter(n => n.strings > 0)
          .toSorted((a, b) => b.strings - a.strings)

        if (nodesWithStrings.length > 0) {
          log.message(`\n  Top files by string count:`)
          for (const node of nodesWithStrings.slice(0, 10)) {
            log.message(`    ${pc.dim(String(node.strings).padStart(3))} strings  ${node.file}`)
          }

          highValuePaths = nodesWithStrings.map(n => n.file)
        }
      } catch {
        s.stop('Graph analysis skipped (not applicable)')
      }
    }

    // ─── Step 2: Scan Summary ───
    const s2 = spinner()
    s2.start('Scanning for hardcoded strings...')

    const summary = await scanSummary(projectRoot, {
      paths: highValuePaths?.slice(0, 50),
    })

    s2.stop(`Found ~${pc.yellow(String(summary.total_candidates_estimate))} candidates in ${summary.total_files} files`)

    if (summary.total_candidates_estimate === 0) {
      log.success('No hardcoded strings found!')
      outro('')
      return
    }

    // Show directory breakdown
    const dirs = Object.entries(summary.by_directory)
      .toSorted((a, b) => b[1].candidates - a[1].candidates)
    if (dirs.length > 0) {
      log.info(pc.bold('By directory'))
      for (const [dir, info] of dirs.slice(0, 10)) {
        log.message(`  ${pc.dim(String(info.candidates).padStart(4))} candidates  ${dir}`)
      }
    }

    // Top repeated strings
    if (summary.top_repeated.length > 0) {
      log.info(pc.bold('Top repeated strings'))
      for (const item of summary.top_repeated.slice(0, 5)) {
        log.message(`  ${pc.dim(`×${item.count}`)} "${pc.cyan(item.value.slice(0, 60))}"`)
      }
    }

    // Confirm scan
    const proceedScan = await confirm({ message: 'Continue with detailed scan?' })
    if (isCancel(proceedScan) || !proceedScan) return handleCancel()

    // ─── Step 3: Paginated Candidate Review ───
    const approved: ApprovedCandidate[] = []
    let offset = 0
    const limit = 20

    while (true) {
      const result = await scanCandidates(projectRoot, {
        paths: highValuePaths?.slice(0, 50),
        offset,
        limit,
      })

      if (result.candidates.length === 0) break

      // Group by file for display
      const byFile = new Map<string, typeof result.candidates>()
      for (const c of result.candidates) {
        const list = byFile.get(c.file) ?? []
        list.push(c)
        byFile.set(c.file, list)
      }

      // Show candidates for review
      const candidateOptions = result.candidates.map((c, i) => ({
        value: String(offset + i),
        label: `${pc.dim(`${c.file}:${c.line}`)} "${c.value.slice(0, 70)}"`,
      }))

      const selected = await multiselect({
        message: `Select strings to extract (${offset + 1}–${offset + result.candidates.length} of ~${summary.total_candidates_estimate})`,
        options: candidateOptions,
        required: false,
      })

      if (isCancel(selected)) break

      // Add selected to approved
      for (const idx of (selected as string[])) {
        const c = result.candidates[Number(idx) - offset]
        if (c) {
          approved.push({
            file: c.file,
            line: c.line,
            value: c.value,
            context: c.surrounding ?? '',
          })
        }
      }

      if (!result.stats.has_more) break

      const continueScanning = await confirm({
        message: `${approved.length} approved so far. Continue scanning?`,
      })
      if (isCancel(continueScanning) || !continueScanning) break

      offset += limit
    }

    if (approved.length === 0) {
      log.message('No strings selected.')
      outro('')
      return
    }

    log.success(`${formatCount(approved.length, 'string')} approved for extraction`)

    // ─── Step 4: Organize into Models ───
    const defaultDomain = ctx.config.domains[0] ?? 'marketing'
    const modelChoice = await select({
      message: 'Organize into which model?',
      options: [
        { value: 'ui-strings', label: `ui-strings (${defaultDomain}) — UI labels, buttons, headings` },
        { value: 'page-content', label: `page-content (${defaultDomain}) — Page content, paragraphs` },
        { value: 'custom', label: 'Custom model name...' },
        ...(ctx.models.length > 0
          ? ctx.models.map(m => ({ value: m.id, label: `${m.id} (existing, ${m.kind})` }))
          : []),
      ],
    })
    if (isCancel(modelChoice)) return handleCancel()

    let modelId = modelChoice as string
    if (modelId === 'custom') {
      const customName = await text({
        message: 'Enter model name (slug format, e.g. "ui-strings"):',
        validate: (v) => {
          if (!v || !/^[a-z][a-z0-9-]*$/.test(v)) return 'Must be lowercase slug format'
        },
      })
      if (isCancel(customName)) return handleCancel()
      modelId = customName as string
    }
    const isExistingModel = ctx.models.some(m => m.id === modelId)

    const extraction: ExtractionEntry = {
      model: modelId,
      kind: isExistingModel
        ? (ctx.models.find(m => m.id === modelId)?.kind ?? 'dictionary')
        : 'dictionary',
      domain: isExistingModel
        ? (ctx.models.find(m => m.id === modelId)?.domain ?? defaultDomain)
        : defaultDomain,
      i18n: ctx.config.locales.supported.length > 1,
      entries: approved.map(c => ({
        locale: ctx.config.locales.default,
        data: { [slugify(c.value)]: c.value },
        source: { file: c.file, line: c.line, value: c.value },
      })),
    }

    // ─── Step 5: Extract ───
    const s5 = spinner()
    s5.start('Previewing extraction...')

    const preview = await applyExtract(projectRoot, {
      extractions: [extraction],
      dry_run: true,
    })
    s5.stop('Preview ready')

    if (preview.preview) {
      log.info(pc.bold('Extraction preview'))
      log.message(`  Models to create: ${preview.preview.models_to_create.join(', ') || 'none'}`)
      log.message(`  Models to update: ${preview.preview.models_to_update.join(', ') || 'none'}`)
      log.message(`  Total entries:    ${preview.preview.total_entries}`)
    }

    if (args['dry-run']) {
      log.message(pc.dim('Dry-run mode — no changes made'))
      outro('')
      return
    }

    const executeExtract = await confirm({ message: 'Apply extraction?' })
    if (isCancel(executeExtract) || !executeExtract) return handleCancel()

    const s5b = spinner()
    s5b.start('Extracting...')

    const extractResult = await applyExtract(projectRoot, {
      extractions: [extraction],
      dry_run: false,
    })

    s5b.stop('Extraction complete')

    if (extractResult.results) {
      log.success(`Created: ${extractResult.results.models_created.join(', ') || 'none'}`)
      log.success(`Entries: ${extractResult.results.entries_written}`)
    }
    if (extractResult.git) {
      log.message(`  Branch: ${pc.cyan(extractResult.git.branch)}`)
    }

    // ─── Step 6: Offer Reuse ───
    if (extractResult.results?.source_map && extractResult.results.source_map.length > 0) {
      const offerReuse = await confirm({
        message: 'Patch source files to use extracted content? (reuse phase)',
      })

      if (!isCancel(offerReuse) && offerReuse) {
        await executeReuse(projectRoot, extractResult.results.source_map, modelId)
      }
    }

    log.info(pc.bold('Next steps'))
    log.message(`  ${pc.cyan('contentrain validate')}  — verify content`)
    log.message(`  ${pc.cyan('contentrain generate')}  — regenerate SDK client`)
    log.message(`  ${pc.cyan('contentrain diff')}      — review pending branches`)

    outro('')
  },
})

async function executeReuse(
  projectRoot: string,
  sourceMap: Array<{ model: string; locale: string; value: string; file: string; line: number }>,
  modelId: string,
): Promise<void> {
  const patches: PatchEntry[] = sourceMap.map(s => ({
    file: s.file,
    line: s.line,
    old_value: s.value,
    new_expression: `{t('${slugify(s.value)}')}`,
  }))

  const s = spinner()
  s.start('Previewing source patches...')

  const preview = await applyReuse(projectRoot, {
    scope: { model: modelId },
    patches,
    dry_run: true,
  })

  s.stop('Patch preview ready')

  if (preview.preview) {
    log.info(pc.bold('Reuse preview'))
    log.message(`  Files to modify: ${preview.preview.files_to_modify.join(', ')}`)
    log.message(`  Patches:         ${preview.preview.patches_count}`)
  }

  const execute = await confirm({ message: 'Apply patches?' })
  if (isCancel(execute) || !execute) return

  const s2 = spinner()
  s2.start('Patching source files...')

  const result = await applyReuse(projectRoot, {
    scope: { model: modelId },
    patches,
    dry_run: false,
  })

  s2.stop('Patches applied')

  if (result.results) {
    log.success(`Files modified: ${result.results.files_modified.length}`)
    log.success(`Patches applied: ${result.results.patches_applied}`)
    if (result.results.patches_skipped.length > 0) {
      log.warning(`Skipped: ${result.results.patches_skipped.length}`)
    }
  }
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 50)
}

function handleCancel(): void {
  outro(pc.dim('Cancelled'))
  process.exit(0)
}

import { defineCommand } from 'citty'
import { intro, outro, log, spinner } from '@clack/prompts'
import { runDoctor, type DoctorReport } from '@contentrain/mcp/core/doctor'
import { resolveProjectRoot } from '../utils/context.js'
import { statusIcon, pc } from '../utils/ui.js'

/**
 * Thin CLI wrapper over the shared `runDoctor()` from `@contentrain/mcp`.
 *
 * All health-check logic lives in the MCP core so the same report
 * drives three consumers: this command, the `contentrain_doctor` MCP
 * tool, and the Serve UI's `/api/doctor` route. Behaviour in the
 * default (non-`--json`) mode is unchanged — same check labels, same
 * details, same grouped usage output.
 */
export default defineCommand({
  meta: {
    name: 'doctor',
    description: 'Check project health and environment',
  },
  args: {
    root: { type: 'string', description: 'Project root path', required: false },
    usage: { type: 'boolean', description: 'Analyze content key usage in source files', required: false },
    json: { type: 'boolean', description: 'Emit the raw DoctorReport JSON', required: false },
  },
  async run({ args }) {
    const projectRoot = await resolveProjectRoot(args.root)
    const useJson = Boolean(args.json)

    if (useJson) {
      // JSON mode is silent + machine-readable. Run the same report,
      // dump it, and exit with a non-zero code if anything failed so
      // CI consumers can wire it into pipelines.
      const report = await runDoctor(projectRoot, { usage: Boolean(args.usage) })
      process.stdout.write(JSON.stringify(report, null, 2))
      if (report.summary.failed > 0) process.exitCode = 1
      return
    }

    intro(pc.bold('contentrain doctor'))
    const s = spinner()
    s.start('Running health checks...')
    if (args.usage) s.message('Analyzing content key usage...')

    const report: DoctorReport = await runDoctor(projectRoot, { usage: Boolean(args.usage) })
    s.stop('Health checks complete')

    // Display results — one line per check, then grouped usage detail.
    for (const check of report.checks) {
      log.message(`${statusIcon(check.pass)} ${pc.bold(check.name)}: ${check.detail}`)
    }

    if (report.usage?.unusedKeys.length) {
      log.message('')
      log.message(pc.bold('  Unused keys:'))
      const grouped = groupBy(report.usage.unusedKeys, e => e.model)
      for (const [model, entries] of Object.entries(grouped)) {
        const keyList = entries.length <= 5
          ? entries.map(e => e.key).join(', ')
          : `${entries.slice(0, 5).map(e => e.key).join(', ')} (+${entries.length - 5} more)`
        log.message(`    ${pc.dim(model)}: ${pc.yellow(keyList)}`)
      }
    }

    if (report.usage?.duplicateValues.length) {
      log.message('')
      log.message(pc.bold('  Duplicate values:'))
      for (const dv of report.usage.duplicateValues.slice(0, 10)) {
        const truncated = dv.value.length > 30 ? `${dv.value.slice(0, 30)}...` : dv.value
        log.message(`    ${pc.dim(`${dv.model}/${dv.locale}`)}: ${pc.yellow(`"${truncated}"`)} → [${dv.keys.join(', ')}]`)
      }
      if (report.usage.duplicateValues.length > 10) {
        log.message(`    ... and ${report.usage.duplicateValues.length - 10} more`)
      }
    }

    if (report.usage?.missingLocaleKeys.length) {
      log.message('')
      log.message(pc.bold('  Missing translations:'))
      const grouped = groupBy(report.usage.missingLocaleKeys, e => `${e.model}/${e.missingIn}`)
      for (const [label, entries] of Object.entries(grouped)) {
        log.message(`    ${pc.dim(label)}: ${pc.yellow(`${entries.length} key(s)`)}`)
      }
    }

    const { passed, failed } = report.summary
    if (failed === 0) {
      outro(pc.green(`All ${passed} checks passed!`))
    } else {
      outro(pc.yellow(`${passed} passed, ${failed} failed`))
      process.exitCode = 1
    }
  },
})

function groupBy<T>(arr: T[], keyFn: (item: T) => string): Record<string, T[]> {
  const result: Record<string, T[]> = {}
  for (const item of arr) {
    const key = keyFn(item)
    if (!result[key]) result[key] = []
    result[key]!.push(item)
  }
  return result
}

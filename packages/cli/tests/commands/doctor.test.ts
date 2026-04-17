import { describe, it, expect, vi, beforeEach } from 'vitest'

// After the phase-14c delegation, the CLI `doctor` command is a thin
// pretty-printer on top of `@contentrain/mcp`'s `runDoctor()`. These
// tests cover the CLI-specific surface: argument wiring, output
// routing (JSON vs interactive), and exit-code semantics. All health-
// check logic is tested in @contentrain/mcp/tests/core/doctor.test.ts.

const runDoctorMock = vi.fn()
const outroMock = vi.fn()
const logMessageMock = vi.fn()

vi.mock('@contentrain/mcp/core/doctor', () => ({
  runDoctor: runDoctorMock,
}))

vi.mock('../../src/utils/context.js', () => ({
  resolveProjectRoot: vi.fn(async (r?: string) => r ?? '/test/project'),
}))

vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  outro: outroMock,
  log: { message: logMessageMock, success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
  spinner: vi.fn(() => ({ start: vi.fn(), stop: vi.fn(), message: vi.fn() })),
}))

describe('doctor command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.exitCode = undefined
    runDoctorMock.mockResolvedValue({
      checks: [
        { name: 'Git', pass: true, detail: 'v2.45.0' },
        { name: '.contentrain/ structure', pass: true, detail: 'OK' },
      ],
      summary: { total: 2, passed: 2, failed: 0, warnings: 0 },
    })
  })

  it('module loads without error', async () => {
    const mod = await import('../../src/commands/doctor.js')
    expect(mod.default).toBeDefined()
    expect(mod.default.meta?.name).toBe('doctor')
  })

  it('exposes --json, --usage, --root args', async () => {
    const mod = await import('../../src/commands/doctor.js')
    expect(mod.default.args?.root).toBeDefined()
    expect(mod.default.args?.usage).toBeDefined()
    expect(mod.default.args?.json).toBeDefined()
  })

  it('delegates to runDoctor with the --usage flag', async () => {
    const mod = await import('../../src/commands/doctor.js')
    await mod.default.run?.({ args: { root: '/test/project', usage: true } } as never)

    expect(runDoctorMock).toHaveBeenCalledWith('/test/project', { usage: true })
  })

  it('emits raw JSON on --json and exits clean when no failures', async () => {
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const mod = await import('../../src/commands/doctor.js')
    await mod.default.run?.({ args: { root: '/test/project', json: true } } as never)

    expect(writeSpy).toHaveBeenCalledTimes(1)
    const payload = JSON.parse(writeSpy.mock.calls[0]?.[0] as string)
    expect(payload.summary.total).toBe(2)
    expect(process.exitCode).toBeUndefined()
    writeSpy.mockRestore()
  })

  it('sets exit code 1 when --json and the report has failures', async () => {
    runDoctorMock.mockResolvedValueOnce({
      checks: [
        { name: 'Git', pass: false, detail: 'Not installed', severity: 'error' },
      ],
      summary: { total: 1, passed: 0, failed: 1, warnings: 0 },
    })
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const mod = await import('../../src/commands/doctor.js')
    await mod.default.run?.({ args: { root: '/test/project', json: true } } as never)

    expect(process.exitCode).toBe(1)
    writeSpy.mockRestore()
  })

  it('renders the usage detail blocks when runDoctor includes a usage report', async () => {
    runDoctorMock.mockResolvedValueOnce({
      checks: [
        { name: 'Unused content keys', pass: false, detail: '3 key(s)', severity: 'warning' },
        { name: 'Duplicate dictionary values', pass: false, detail: '1 value', severity: 'warning' },
        { name: 'Locale key coverage', pass: true, detail: 'All locales have matching keys' },
      ],
      summary: { total: 3, passed: 1, failed: 2, warnings: 2 },
      usage: {
        unusedKeys: [
          { model: 'docs', kind: 'dictionary', key: 'hero.title', locale: 'en' },
          { model: 'docs', kind: 'dictionary', key: 'cta.label', locale: 'en' },
        ],
        duplicateValues: [
          { model: 'docs', locale: 'en', value: 'Get started', keys: ['hero.cta', 'footer.cta'] },
        ],
        missingLocaleKeys: [],
      },
    })
    const mod = await import('../../src/commands/doctor.js')
    await mod.default.run?.({ args: { root: '/test/project', usage: true } } as never)

    const messages = logMessageMock.mock.calls.map(c => String(c[0]))
    expect(messages.some(m => m.includes('Unused keys:'))).toBe(true)
    expect(messages.some(m => m.includes('hero.title'))).toBe(true)
    expect(messages.some(m => m.includes('Duplicate values:'))).toBe(true)
  })

  it('sets exit code 1 when the interactive run has any failed check', async () => {
    runDoctorMock.mockResolvedValueOnce({
      checks: [{ name: 'Git', pass: false, detail: 'Not installed', severity: 'error' }],
      summary: { total: 1, passed: 0, failed: 1, warnings: 0 },
    })
    const mod = await import('../../src/commands/doctor.js')
    await mod.default.run?.({ args: { root: '/test/project' } } as never)

    expect(outroMock).toHaveBeenCalledWith(expect.stringContaining('failed'))
    expect(process.exitCode).toBe(1)
  })
})

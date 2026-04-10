import { describe, it, expect, vi } from 'vitest'

const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

vi.mock('../../../src/studio/client.js', () => ({
  resolveStudioClient: vi.fn().mockResolvedValue({
    listWorkspaces: vi.fn().mockResolvedValue([]),
    listProjects: vi.fn().mockResolvedValue([]),
    listBranches: vi.fn().mockResolvedValue([
      { name: 'cr/content/blog-1', ahead: 3, lastCommitDate: new Date().toISOString(), author: 'editor@test.com' },
      { name: 'cr/content/pricing-2', ahead: 1, lastCommitDate: new Date().toISOString(), author: null },
    ]),
    mergeBranch: vi.fn().mockResolvedValue(undefined),
    rejectBranch: vi.fn().mockResolvedValue(undefined),
  }),
}))

vi.mock('../../../src/studio/resolve-context.js', () => ({
  resolveStudioContext: vi.fn().mockResolvedValue({ workspaceId: 'ws-1', projectId: 'p-1' }),
}))

vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  log: { message: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
  spinner: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
  select: vi.fn().mockResolvedValue('__cancel__'),
  confirm: vi.fn().mockResolvedValue(false),
  isCancel: vi.fn().mockReturnValue(false),
}))

describe('studio branches command', () => {
  it('module loads and has correct metadata', async () => {
    const mod = await import('../../../src/studio/commands/branches.js')
    expect(mod.default.meta?.name).toBe('branches')
  })

  it('outputs valid JSON in json mode', async () => {
    const mod = await import('../../../src/studio/commands/branches.js')
    await mod.default.run?.({ args: { json: true } })

    expect(writeSpy).toHaveBeenCalled()
    const output = JSON.parse(String(writeSpy.mock.calls.at(-1)?.[0] ?? '[]')) as unknown[]

    expect(output.length).toBe(2)
    expect((output[0] as Record<string, unknown>)['name']).toBe('cr/content/blog-1')
  })
})

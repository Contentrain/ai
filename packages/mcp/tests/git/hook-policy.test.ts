import { describe, expect, it } from 'vitest'
import { VERIFY_ENV, commitOptions, hookPolicy } from '../../src/git/hook-policy.js'

// Precedence of the commit-hook switch, the same shape as pushPolicy: the env
// wins over the config in both directions; without either, hooks are skipped.
describe('hookPolicy', () => {
  it('skips commit hooks by default', () => {
    expect(hookPolicy(null, {})).toEqual({ verify: false, source: 'default' })
    expect(hookPolicy({}, {})).toEqual({ verify: false, source: 'default' })
    expect(hookPolicy({ git: { verify: false } }, {})).toEqual({ verify: false, source: 'default' })
  })

  it('runs them with git.verify: true', () => {
    expect(hookPolicy({ git: { verify: true } }, {})).toEqual({ verify: true, source: 'config' })
  })

  it('runs them with the env, over a config that does not', () => {
    expect(hookPolicy({}, { [VERIFY_ENV]: '1' })).toEqual({ verify: true, source: 'env' })
    expect(hookPolicy({ git: { verify: false } }, { [VERIFY_ENV]: 'TRUE' })).toEqual({ verify: true, source: 'env' })
  })

  it('skips them with the env, over git.verify: true', () => {
    expect(hookPolicy({ git: { verify: true } }, { [VERIFY_ENV]: '0' })).toEqual({ verify: false, source: 'env' })
    expect(hookPolicy({ git: { verify: true } }, { [VERIFY_ENV]: 'false' })).toEqual({ verify: false, source: 'env' })
  })

  it('ignores an unrecognised env value', () => {
    expect(hookPolicy({ git: { verify: true } }, { [VERIFY_ENV]: 'yes' })).toEqual({ verify: true, source: 'config' })
    expect(hookPolicy({}, { [VERIFY_ENV]: '' })).toEqual({ verify: false, source: 'default' })
  })

  it('adds --no-verify only when hooks are skipped', () => {
    expect(commitOptions({ verify: false, source: 'default' }, { '--allow-empty': null })).toEqual({ '--allow-empty': null, '--no-verify': null })
    expect(commitOptions({ verify: true, source: 'config' }, { '--allow-empty': null })).toEqual({ '--allow-empty': null })
  })
})

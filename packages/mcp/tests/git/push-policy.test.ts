import { describe, expect, it } from 'vitest'
import { NO_PUSH_ENV, localModeReason, pushPolicy } from '../../src/git/push-policy.js'

// Precedence of the local-mode switch: the env wins over the config in both
// directions; without either, pushing is on. Pure — no git.
describe('pushPolicy', () => {
  it('defaults to pushing', () => {
    expect(pushPolicy(null, {})).toEqual({ push: true, source: 'default' })
    expect(pushPolicy({}, {})).toEqual({ push: true, source: 'default' })
    expect(pushPolicy({ git: { push: true } }, {})).toEqual({ push: true, source: 'default' })
  })

  it('turns pushing off with git.push: false', () => {
    expect(pushPolicy({ git: { push: false } }, {})).toEqual({ push: false, source: 'config' })
  })

  it('turns pushing off with the env, over a config that allows it', () => {
    expect(pushPolicy({}, { [NO_PUSH_ENV]: '1' })).toEqual({ push: false, source: 'env' })
    expect(pushPolicy({ git: { push: true } }, { [NO_PUSH_ENV]: 'TRUE' })).toEqual({ push: false, source: 'env' })
  })

  it('turns pushing back on with the env, over git.push: false', () => {
    expect(pushPolicy({ git: { push: false } }, { [NO_PUSH_ENV]: '0' })).toEqual({ push: true, source: 'env' })
    expect(pushPolicy({ git: { push: false } }, { [NO_PUSH_ENV]: 'false' })).toEqual({ push: true, source: 'env' })
  })

  it('ignores an unrecognised env value', () => {
    expect(pushPolicy({ git: { push: false } }, { [NO_PUSH_ENV]: 'yes' })).toEqual({ push: false, source: 'config' })
    expect(pushPolicy({}, { [NO_PUSH_ENV]: '' })).toEqual({ push: true, source: 'default' })
  })
})

describe('localModeReason', () => {
  it('names the switch that turned pushing off', () => {
    expect(localModeReason({ push: false, source: 'env' })).toContain('CONTENTRAIN_NO_PUSH=1')
    expect(localModeReason({ push: false, source: 'config' })).toContain('git.push: false')
  })
})

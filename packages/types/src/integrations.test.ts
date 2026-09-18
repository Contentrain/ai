import { describe, it, expect } from 'vitest'
import type { IntegrationReconnectRequiredIssue, RawIntegration, RawIntegrationScan, RawIR } from './index'
import { INTEGRATION_CATEGORIES, INTEGRATION_EVIDENCE_KINDS } from './index'
import integrationsJson from './fixtures/bridge-b07/integrations.json'
import integrationsNoneJson from './fixtures/bridge-b07/integrations-none.json'

// The Bridge's own output (fixtures/bridge-b07/README.md). As in
// seo-routing.test.ts, `Record<keyof T, true>` holds each key list to its type
// and every key the producer writes must be one of them.

const SCAN_KEYS: Record<keyof RawIntegrationScan, true> = { format: true, scanned: true, services: true, totals: true }
const SCANNED_KEYS: Record<keyof RawIntegrationScan['scanned'], true> = {
  options: true, plugins: true, posts: true, rendered_home: true, script_sources: true,
}
const TOTALS_KEYS: Record<keyof RawIntegrationScan['totals'], true> = { services: true, reconnect_required: true }
const INTEGRATION_KEYS: Record<keyof RawIntegration, true> = {
  service: true, name: true, category: true, evidence: true, reconnect_required: true, secret_present: true, notes: true,
}
const EVIDENCE_KEYS: Record<keyof RawIntegration['evidence'][number], true> = { kind: true, detail: true }

const undeclared = (value: object, declared: object) => Object.keys(value).filter(key => !(key in declared))

const scan = integrationsJson as unknown as RawIntegrationScan
const none = integrationsNoneJson as unknown as RawIntegrationScan
const { services } = scan

// What the Bridge's tools/prepare-migrate.mjs raises from RawIR.integrations.
function reconnectIssues(integrations: RawIntegration[]): IntegrationReconnectRequiredIssue[] {
  const reconnect = integrations.filter(s => s.reconnect_required)
  return reconnect.length
    ? [{ code: 'integration_reconnect_required', services: reconnect.map(s => ({ service: s.service, name: s.name, category: s.category, secret_present: s.secret_present })) }]
    : []
}

describe('RawIntegrationScan against the Bridge', () => {
  it('declares every key the Bridge writes', () => {
    for (const document of [scan, none]) {
      expect(undeclared(document, SCAN_KEYS)).toEqual([])
      expect(undeclared(document.scanned, SCANNED_KEYS)).toEqual([])
      expect(undeclared(document.totals, TOTALS_KEYS)).toEqual([])
    }
    for (const service of services) {
      expect(undeclared(service, INTEGRATION_KEYS)).toEqual([])
      for (const evidence of service.evidence) expect(undeclared(evidence, EVIDENCE_KEYS)).toEqual([])
    }
  })

  it('holds the closed vocabularies', () => {
    expect(scan.format).toBe('contentrain-bridge-integrations@1')
    for (const service of services) expect(INTEGRATION_CATEGORIES).toContain(service.category)
    const kinds = new Set(services.flatMap(s => s.evidence.map(e => e.kind)))
    // The fixture exercises every evidence kind.
    expect([...kinds].toSorted()).toEqual([...INTEGRATION_EVIDENCE_KINDS].toSorted())
    expect(new Set(services.map(s => s.category))).toEqual(new Set(['analytics', 'captcha', 'cdn', 'crm', 'newsletter', 'other']))
    expect(new Set(services.map(s => s.service)).size).toBe(services.length)
  })

  it('closes its totals', () => {
    expect(scan.totals).toEqual({ services: services.length, reconnect_required: services.filter(s => s.reconnect_required).length })
    expect(scan.totals).toEqual({ services: 9, reconnect_required: 8 })
  })

  it('exports whether a credential is set, never the credential', () => {
    expect(services.filter(s => s.secret_present).map(s => s.service).toSorted()).toEqual(['akismet', 'hubspot', 'mailchimp', 'recaptcha'])
    expect(services.every(s => typeof s.secret_present === 'boolean')).toBe(true)
    // A credential appears only by its setting's name.
    const mailchimp = services.find(s => s.service === 'mailchimp')!
    expect(mailchimp.evidence).toContainEqual({ kind: 'option-key', detail: 'mc4wp (api_key)' })
  })

  it('does not ask to reconnect an embed, which has no account', () => {
    const youtube = services.find(s => s.service === 'embed-youtube')!
    expect(youtube).toMatchObject({ category: 'other', reconnect_required: false, secret_present: false })
    expect(youtube.evidence).toEqual([{ kind: 'embed-domain', detail: 'youtube.com' }])
  })

  it('states an empty result with its scan counts', () => {
    expect(none.services).toEqual([])
    expect(none.totals).toEqual({ services: 0, reconnect_required: 0 })
    expect(none.scanned.options).toBeGreaterThan(0)
  })

  it('raises one reconnect issue listing every service that needs it, and none for no services', () => {
    const raw: Pick<RawIR, 'integrations'> = { integrations: services }
    const issues = reconnectIssues(raw.integrations!)
    expect(issues).toHaveLength(1)
    expect(issues[0]!.services).toHaveLength(scan.totals.reconnect_required)
    expect(issues[0]!.services).toContainEqual({ service: 'hubspot', name: 'HubSpot', category: 'crm', secret_present: true })
    expect(issues[0]!.services.map(s => s.service)).not.toContain('embed-youtube')
    expect(reconnectIssues(none.services)).toEqual([])
  })
})

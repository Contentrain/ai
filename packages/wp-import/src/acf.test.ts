import { describe, it, expect } from 'vitest'
import { validateFieldValue } from '@contentrain/types'
import { ACF_SCALAR_TYPES, acfFieldDef, acfIsSecret, acfRows, acfScrub, acfValue } from './acf'
import { fetchRestRawIR, rawToContentrain } from './index'

describe('ACF → Contentrain mapping table', () => {
  it('maps every stated scalar type deterministically', () => {
    const cases: Array<[string, unknown, string]> = [
      ['text', 'Harbor Co', 'string'], ['textarea', 'A summary', 'text'], ['wysiwyg', '<p>x</p>', 'richtext'],
      ['email', 'a@b.test', 'email'], ['url', 'https://x.test', 'url'], ['oembed', 'https://youtu.be/x', 'url'],
      ['number', 350000, 'number'], ['range', 14, 'number'], ['true_false', false, 'boolean'],
      ['date_picker', '20250312', 'date'], ['date_time_picker', '2024-09-03 09:30:00', 'datetime'], ['time_picker', '09:15:00', 'string'],
      ['color_picker', '#2e5eaa', 'color'], ['icon_picker', { type: 'dashicons', value: 'dashicons-hammer' }, 'icon'],
      ['image', { ID: 85, id: 85, url: 'https://s.test/a.png', filename: 'a.png' }, 'image'], ['file', { ID: 88, id: 88, url: 'https://s.test/b.pdf', filename: 'b.pdf' }, 'file'],
    ]
    for (const [type, value, want] of cases) {
      expect(acfFieldDef('f', value, { type })?.type, type).toBe(want)
      expect(ACF_SCALAR_TYPES[type], type).toBe(want)
    }
  })

  it('converts values to the shape their type promises', () => {
    expect(acfValue({ type: 'date' }, '20250312')).toBe('2025-03-12')
    expect(acfValue({ type: 'datetime' }, '2024-09-03 09:30:00')).toBe('2024-09-03T09:30:00')
    expect(acfValue({ type: 'image' }, { ID: 85, id: 85, url: 'https://s.test/a.png', filename: 'a.png' })).toBe('https://s.test/a.png')
    expect(acfValue({ type: 'icon' }, { type: 'dashicons', value: 'dashicons-hammer' })).toBe('dashicons-hammer')
    expect(acfValue({ type: 'boolean' }, '1')).toBe(true)
    expect(acfValue({ type: 'number' }, '42')).toBe(42)
  })

  it('selects become select with the stated choices; multiple selects and checkboxes become arrays of them', () => {
    expect(acfFieldDef('s', 'planned', { type: 'select', choices: ['planned', 'active'] })).toEqual({ type: 'select', options: ['planned', 'active'] })
    expect(acfFieldDef('s', 'planned', { type: 'radio' })).toEqual({ type: 'string' })
    expect(acfFieldDef('p', ['web', 'ios'], { type: 'select' })).toEqual({ type: 'array', items: 'string' })
    expect(acfFieldDef('c', ['design'], { type: 'checkbox', choices: ['design', 'build'] })).toEqual({ type: 'array', items: { type: 'select', options: ['design', 'build'] } })
  })

  it('link, google map and group become objects; repeaters arrays of objects, nested too', () => {
    expect(acfFieldDef('l', { url: 'https://x', title: 'Go', target: '' }, { type: 'link' })).toMatchObject({ type: 'object', fields: { url: { type: 'url' }, title: { type: 'string' }, target: { type: 'string' } } })
    expect(acfFieldDef('m', { address: 'Galata', lat: 41.02, lng: 28.97, zoom: 14 }, { type: 'google_map' })).toMatchObject({ type: 'object', fields: { lat: { type: 'decimal' } } })
    expect(acfFieldDef('g', { label: 'Span', value: '320 m' }, { type: 'group' })).toEqual({ type: 'object', fields: { label: { type: 'string' }, value: { type: 'string' } } })
    const phases = acfFieldDef('phases', [{ name: 'Phase 1', tasks: [{ task: 'Survey' }] }], { type: 'repeater' })
    expect(phases).toEqual({ type: 'array', items: { type: 'object', fields: { name: { type: 'string' }, tasks: { type: 'array', items: { type: 'object', fields: { task: { type: 'string' } } } } } } })
    const ms = acfFieldDef('milestones', [{ title: 'Design', date: '20240901', done: true }], { type: 'repeater' })!
    expect(acfValue(ms, [{ title: 'Design', date: '20240901', done: true }])).toEqual([{ title: 'Design', date: '2024-09-01', done: true }])
  })

  it('flexible content keeps every layout, in order, with its name and all its fields (a link keeps its label)', () => {
    const rows = [
      { acf_fc_layout: 'hero', heading: 'Inside', subheading: 'How', image: { ID: 85, id: 85, url: 'https://s.test/a.png', filename: 'a.png' } },
      { acf_fc_layout: 'cta', heading: 'Build yours', link: { url: 'https://s.test/contact/', title: 'Contact', target: '' } },
    ]
    const def = acfFieldDef('sections', rows, { type: 'flexible_content' })!
    expect(def).toMatchObject({ type: 'array', items: { type: 'object', fields: { layout: { type: 'select', options: ['cta', 'hero'], required: true }, heading: { type: 'string' }, image: { type: 'image' }, link: { type: 'object' } } } })
    expect(acfValue(def, acfRows(rows))).toEqual([
      { layout: 'hero', heading: 'Inside', subheading: 'How', image: 'https://s.test/a.png' },
      { layout: 'cta', heading: 'Build yours', link: { url: 'https://s.test/contact/', title: 'Contact' } },
    ])
  })

  it('never reads a secret: a password type, or — with no stated type — a secret-looking name; layout fields carry nothing', () => {
    expect(acfIsSecret('api_secret', 'password')).toBe(true)
    expect(acfIsSecret('client', 'text')).toBe(false)
    expect(acfIsSecret('api_key', undefined)).toBe(true)
    expect(acfFieldDef('anything', 'GOLDEN', { type: 'password' })).toBeNull()
    expect(acfFieldDef('note', 'Fill in', { type: 'message' })).toBeNull()
    expect(acfFieldDef('related', [1, 2], { type: 'relationship' })).toBeNull()
  })

  it('matches secret names by whole word: passage and compass are content, apiKey and user_pass are not', () => {
    for (const name of ['user_pass', 'password', 'apiKey', 'api-key', 'client_secret', 'access_token', 'userPassword', 'private_key', 'credentials']) expect(acfIsSecret(name, undefined), name).toBe(true)
    for (const name of ['passage_text', 'compass', 'passenger_count', 'tokenized', 'secretary', 'keynote']) expect(acfIsSecret(name, undefined), name).toBe(false)
  })

  it('removes a secret sub-field at any depth, stated by its _source or by its name, with its _source', () => {
    const pw = { type: 'password', label: 'Door', formatted_value: 'S3' }
    const value = [{ title: 'Design', door: 'S1', door_source: pw, rows: [{ pin: 'S2', pin_source: pw, note: 'ok', note_source: { type: 'text', label: 'Note', formatted_value: 'ok' } }], api_key: 'S4', tip: 'x', tip_source: { type: 'message' } }]
    const out = acfScrub(value)
    expect(JSON.stringify(out)).not.toMatch(/S[1-4]|door|pin|api_key|tip/)
    expect(out).toEqual([{ title: 'Design', rows: [{ note: 'ok', note_source: { type: 'text', label: 'Note' } }] }])
    // A row typed by another row still drops the field where its own _source says password.
    const def = acfFieldDef('m', [{ title: 'A', door: 'blue' }], { type: 'repeater' })!
    expect(acfValue(def, [{ title: 'A', door: 'blue' }, { title: 'B', door: 'S1', door_source: pw }])).toEqual([{ title: 'A', door: 'blue' }, { title: 'B' }])
    // …and scrubbing drops it from every row once one row states it: a row without _source keeps nothing either.
    expect(acfScrub([{ title: 'A', door: 'S5' }, { title: 'B', door: 'S1', door_source: pw }])).toEqual([{ title: 'A' }, { title: 'B' }])
  })

  it('infers a type from the value only when the source states none, and says so', () => {
    expect(acfFieldDef('subtitle', 'A subtitle')).toMatchObject({ type: 'string', description: 'ACF (type inferred from the value)' })
  })
})

// ── REST end to end: a Secure Custom Fields site (response shapes from golden `acf`, SCF 6.9.5) ──

const SECRET = 'GOLDEN-ACF-PASSWORD-SECRET'
const src = (type: string, label: string) => ({ type, label, formatted_value: null })
const projectAcf = (id: number, others: number[]) => ({
  client: 'Harbor Co', client_source: src('text', 'Client'),
  budget: 250000, budget_source: src('number', 'Budget'),
  launch_date: '20250310', launch_date_source: src('date_picker', 'Launch Date'),
  status: 'done', status_source: src('select', 'Status'),
  services: ['design', 'build'], services_source: src('checkbox', 'Services'),
  hero_image: { ID: 85, id: 85, url: 'https://s.example/wp-content/uploads/a.png', filename: 'a.png' }, hero_image_source: src('image', 'Hero Image'),
  cta_link: { url: 'https://s.example/contact/', title: 'Start a project', target: '_blank' }, cta_link_source: src('link', 'Cta Link'),
  related_projects: others, related_projects_source: src('relationship', 'Related Projects'),
  lead: 1, lead_source: src('user', 'Lead'),
  primary_type: 3, primary_type_source: src('taxonomy', 'Primary Type'),
  landing_page: 14, landing_page_source: src('page_link', 'Landing Page'),
  parent_page: 11, parent_page_source: src('post_object', 'Parent Page'),
  gallery: [85], gallery_source: src('gallery', 'Gallery'),
  location: { address: 'Galata Bridge, Istanbul', lat: 41.0201, lng: 28.9731, zoom: 14 }, location_source: src('google_map', 'Location'),
  api_secret: SECRET, api_secret_source: src('password', 'Api Secret'),
  specs: { label: 'Span', value: `${300 + id} m`, pin: SECRET, pin_source: { type: 'password', label: 'Pin', formatted_value: SECRET } }, specs_source: src('group', 'Specs'),
  milestones: [{ title: 'Design', date: '20240901', done: true, door: SECRET, door_source: { type: 'password', label: 'Door', formatted_value: SECRET } }], milestones_source: src('repeater', 'Milestones'),
  sections: [{ acf_fc_layout: 'cta', heading: 'Build yours', code: SECRET, code_source: { type: 'password', label: 'Code', formatted_value: SECRET }, link: { url: 'https://s.example/contact/', title: 'Contact', target: '' } }], sections_source: src('flexible_content', 'Sections'),
})

const json = (b: unknown) => new Response(JSON.stringify(b), { headers: { 'content-type': 'application/json' } })
const entry = (id: number, slug: string, over: Record<string, unknown> = {}) => ({ id, slug, status: 'publish', link: `https://s.example/${slug}/`, title: { rendered: slug }, content: { rendered: `<p>${slug}</p>` }, date_gmt: '2026-01-10T10:00:00', author: 1, ...over })

function scfSite(): typeof fetch {
  return (async (url: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const u = String(url)
    const auth = !!(init?.headers as Record<string, string>)?.authorization
    if (u.includes('/users/me')) return json({ id: 1 })
    if (u.endsWith('/wp-json/')) return json({ name: 'Golden Works' })
    if (u.includes('/wp/v2/types')) return json({
      page: { slug: 'page', rest_base: 'pages', ...(auth ? { viewable: true } : {}) },
      project: { slug: 'project', rest_base: 'projects', ...(auth ? { viewable: true } : {}) },
      testimonial: { slug: 'testimonial', rest_base: 'testimonials', ...(auth ? { viewable: false } : {}) },
    })
    if (u.includes('/wp/v2/taxonomies')) return json({ category: { slug: 'category', rest_base: 'categories' }, project_type: { slug: 'project_type', rest_base: 'project_type' }, nav_menu: { slug: 'nav_menu', rest_base: 'menus' } })
    if (u.includes('/project_type?')) return json([{ id: 3, slug: 'software', name: 'Software' }])
    if (u.includes('/users?')) return json([{ id: 1, slug: 'admin', name: 'Admin' }])
    if (u.includes('/media?')) return json([{ id: 85, slug: 'a', source_url: 'https://s.example/wp-content/uploads/a.png', mime_type: 'image/png' }])
    if (u.includes('/pages?')) return json([entry(11, 'about', { acf: [] }), ...(auth ? [entry(14, 'secret-plan', { status: 'draft', link: 'https://s.example/?page_id=14', acf: [] })] : [])])
    if (u.includes('/projects?')) return json([
      entry(100, 'harbor-bridge', { project_type: [3], acf: projectAcf(0, [101]) }),
      entry(101, 'metro-signalling', { project_type: [3], acf: projectAcf(1, [100]) }),
      ...(auth ? [entry(103, 'tunnel-bid', { status: 'draft', project_type: [], acf: { ...projectAcf(3, []), client: 'Draft client' } })] : []),
    ])
    if (u.includes('/testimonials?')) return json([entry(98, 'great-partner', { link: 'https://s.example/testimonial/great-partner/', acf: { person: 'Ece Demir', person_source: src('text', 'Person'), rating: 5, rating_source: src('number', 'Rating') } })])
    if (/\/(categories|tags|comments|menus|menu-items|navigation|template-parts)\?/.test(u)) return json([])
    return new Response('nope', { status: 404 })
  }) as typeof fetch
}

describe('fetchRestRawIR + rawToContentrain on a Secure Custom Fields site', () => {
  it('never reads a password field: the value is nowhere in RawIR or the store', async () => {
    for (const auth of [undefined, { user: 'u', appPassword: 'p' }]) {
      const { raw } = await fetchRestRawIR({ origin: 'https://s.example', fetchImpl: scfSite(), auth })
      expect(JSON.stringify(raw)).not.toContain(SECRET)
      expect(JSON.stringify(raw)).not.toContain('api_secret')
      const { files } = rawToContentrain(raw)
      expect(JSON.stringify(files)).not.toContain(SECRET)
    }
  })

  it('types every field from the stated ACF type and resolves references to store entries', async () => {
    const { raw, gaps } = await fetchRestRawIR({ origin: 'https://s.example', fetchImpl: scfSite(), auth: { user: 'u', appPassword: 'p' } })
    expect(gaps).toContain('acf_partial')
    expect(raw.posts.find((p) => p.id === 100)!.acf!.client).toEqual({ value: 'Harbor Co', type: 'text', label: 'Client' })
    const { files } = rawToContentrain(raw)
    const model = JSON.parse(files['.contentrain/models/project.json']!)
    const f = model.fields
    expect(f.client).toMatchObject({ type: 'string', label: 'Client', description: 'ACF' })
    expect(f.budget.type).toBe('number')
    expect(f.launch_date.type).toBe('date')
    expect(f.services).toMatchObject({ type: 'array' })
    expect(f.hero_image.type).toBe('image')
    expect(f.cta_link).toMatchObject({ type: 'object' })
    expect(f.related_projects).toMatchObject({ type: 'relations', model: 'project' })
    expect(f.lead).toMatchObject({ type: 'relation', model: 'authors' })
    expect(f.primary_type).toMatchObject({ type: 'relation', model: 'project-type' })
    expect(f.parent_page).toMatchObject({ type: 'relation', model: 'pages' })
    expect(f.gallery).toMatchObject({ type: 'relations', model: 'media' })
    expect(f.landing_page.type).toBe('url')
    expect(f.location).toMatchObject({ type: 'object' })
    expect(f.specs).toMatchObject({ type: 'object' })
    expect(f.milestones).toMatchObject({ type: 'array', items: { type: 'object' } })
    expect(f.sections).toMatchObject({ type: 'array', items: { type: 'object', fields: { layout: { type: 'select' } } } })
    expect(f.api_secret).toBeUndefined()
    // The custom taxonomy is a model and the projects link to its term.
    expect(files['.contentrain/models/project-type.json']).toBeDefined()
    expect(f['project-type']).toMatchObject({ type: 'relations', model: 'project-type' })

    const byId = JSON.parse(files[Object.keys(files).find((p) => /content\/[^/]+\/project\//.test(p))!]!) as Record<string, Record<string, unknown>>
    const idOf = (slug: string) => Object.keys(byId).find((k) => byId[k]!.slug === slug)!
    const harbor = byId[idOf('harbor-bridge')]!
    expect(harbor).toMatchObject({
      client: 'Harbor Co', launch_date: '2025-03-10', services: ['design', 'build'], hero_image: 'https://s.example/wp-content/uploads/a.png',
      cta_link: { url: 'https://s.example/contact/', title: 'Start a project', target: '_blank' },
      specs: { label: 'Span', value: '300 m' }, milestones: [{ title: 'Design', date: '2024-09-01', done: true }],
      sections: [{ layout: 'cta', heading: 'Build yours', link: { url: 'https://s.example/contact/', title: 'Contact' } }],
      location: { address: 'Galata Bridge, Istanbul', lat: 41.0201, lng: 28.9731, zoom: 14 },
    })
    expect(harbor.related_projects).toEqual([idOf('metro-signalling')])
    expect(typeof harbor.lead).toBe('string')
    expect(typeof harbor.primary_type).toBe('string')
    expect((harbor.gallery as string[]).length).toBe(1)
    // A page link to a draft page is no address: left out.
    expect(harbor.landing_page).toBeUndefined()
    // Every value validates against its field definition.
    for (const [k, def] of Object.entries(f as Record<string, never>)) if (k in harbor) expect(validateFieldValue(harbor[k], def).filter((x: { severity: string }) => x.severity === 'error'), k).toEqual([])
  })

  it('a draft keeps its custom fields and comes in as a draft', async () => {
    const { raw } = await fetchRestRawIR({ origin: 'https://s.example', fetchImpl: scfSite(), auth: { user: 'u', appPassword: 'p' } })
    const { files } = rawToContentrain(raw)
    const path = Object.keys(files).find((p) => /content\/[^/]+\/project\//.test(p))!
    const byId = JSON.parse(files[path]!) as Record<string, Record<string, unknown>>
    const [id, draft] = Object.entries(byId).find(([, e]) => e.slug === 'tunnel-bid')!
    expect(draft.client).toBe('Draft client')
    const meta = JSON.parse(files[Object.keys(files).find((p) => /meta\/project\//.test(p))!]!)
    expect(meta[id].status).toBe('draft')
  })

  it('a type WordPress says has no public address comes in without one', async () => {
    const { raw } = await fetchRestRawIR({ origin: 'https://s.example', fetchImpl: scfSite(), auth: { user: 'u', appPassword: 'p' } })
    expect(raw.posts.find((p) => p.id === 98)!.link).toBeNull()
    expect(raw.posts.find((p) => p.id === 100)!.link).toBe('https://s.example/harbor-bridge/')
    const { files } = rawToContentrain(raw)
    const t = Object.values(JSON.parse(files[Object.keys(files).find((p) => /content\/[^/]+\/testimonial\//.test(p))!]!)) as Array<Record<string, unknown>>
    expect(t[0]).toMatchObject({ person: 'Ece Demir', rating: 5 })
    expect(t[0]!.link).toBeUndefined()
  })
})

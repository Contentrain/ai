// ─── Understand contract ───
//
// Migrate, render-first: "AI understands, the engine executes". A page template
// is rendered at three widths, cut into horizontal bands by geometry, and each
// band is read once by a vision model that says what the band is and which
// outline nodes hold its content. Everything after that is deterministic: the
// plan maps an archetype to a kit component, the measured style rides along as
// parameters, and the content is read from the nodes the model pointed at.
//
// Three stages bind to this file:
//
//   facts       → `Band[]`       measured, deterministic, no model
//   understand  → `RegionSpec[]` one model reading per template, grounded
//   plan        → placements     archetype + measured params by `Fidelity`
//
// Two rules hold the design together:
//
// 1. Grounding. A `RegionSpec` never holds content, only node ids. Text, image
//    addresses, link targets and icons are read from the outline by the engine.
//    A slot that names no usable node is an issue, never a silent drop, and
//    never a reason to take the model's own words.
// 2. Neutrality. Nothing here names a source system (CMS, page builder) or a
//    target framework. What a source knows beyond the render (builder widget
//    types and the like) travels in `Band.hints` and is never required.

// ─── Geometry ───

/** The widths every template is rendered at; the widest is the reference outline. */
export const UNDERSTAND_WIDTHS = [390, 768, 1280] as const
export type Width = (typeof UNDERSTAND_WIDTHS)[number]

/** The width whose outline numbers the nodes (see `SlotRef.node`). */
export const UNDERSTAND_REFERENCE_WIDTH = 1280 satisfies Width

/** Document coordinates, px, rounded. */
export interface Box { x: number, y: number, w: number, h: number }

/**
 * What the engine measured on a band, from computed styles and boxes. Lengths
 * are px at the reference width unless keyed by width; colours are CSS colours
 * as computed. Every field is optional: absent means "not measured" or "the
 * default", never zero.
 */
export interface MeasuredStyle {
  /** Width of the band's content column. */
  containerPx?: number
  /** Vertical padding (one side; the larger when top and bottom differ). */
  padY?: number
  /** Horizontal padding at the reference width. */
  padX?: number
  bg?: {
    color?: string
    /** The background image's address as rendered (lazy backgrounds forced). */
    image?: string
    /** A colour or gradient laid over the image. */
    overlay?: string
    size?: string
    position?: string
  }
  /** Columns of the band's repeated items, per width. */
  columns?: Partial<Record<Width, number>>
  gap?: number
  /** Whether the band's text sits on a light or a dark surface. */
  tone?: 'light' | 'dark'
  /** Where the band's heading and lead sit across the content column. */
  align?: 'start' | 'center' | 'end'
  radius?: number
  minHeight?: number
}

// ─── Bands (facts output) ───

export const BAND_LANDMARKS = ['header', 'nav', 'main', 'footer'] as const
export type BandLandmark = (typeof BAND_LANDMARKS)[number]

/**
 * One horizontal band of a template's representative page: a full-width slice
 * found by geometry (background changes, vertical gaps, landmarks), not by any
 * builder's markup. Deterministic: the same render gives the same bands.
 */
export interface Band {
  /** Unique in a run and stable for a template and order. Opaque to readers; holds no `#`. */
  id: string
  /** Template family key. */
  template: string
  /** Position down the page, from 0. */
  order: number
  /** The landmark element the band is, or lies inside. */
  landmark?: BandLandmark
  /** The band's box per width. Absent at a width: not shown there. The reference width is always present. */
  boxes: Partial<Record<Width, Box>>
  /**
   * The band's nodes as an inclusive range of node ids (see `SlotRef.node`). A band is one subtree or a run of sibling
   * subtrees, so the range is contiguous, and the ranges of a template's bands ascend with `order` and never overlap.
   */
  nodes: { first: number, last: number }
  style: MeasuredStyle
  /** Source-specific signals (builder widget types, block names). Optional reading aid; nothing may depend on it. */
  hints?: Record<string, unknown>
}

// ─── Regions (understanding output) ───

export const ARCHETYPES = [
  'header', 'footer', 'hero', 'card-grid', 'feature-split', 'logo-strip', 'stats', 'testimonial', 'faq', 'cta-band',
  'pricing', 'team', 'gallery', 'slider', 'post-list', 'contact-form', 'timeline', 'text', 'other',
] as const
/** What a region is, as a shape the kit can build. `other`: none of them, so the styled fallback section. */
export type Archetype = (typeof ARCHETYPES)[number]

/** Archetypes that are nothing without their repeated items. */
export const ITEM_ARCHETYPES = [
  'card-grid', 'logo-strip', 'stats', 'testimonial', 'faq', 'pricing', 'team', 'gallery', 'slider', 'timeline',
] as const satisfies readonly Archetype[]

/**
 * Archetypes whose content is not in the band's nodes, so a region may hold no slot at all: `post-list` reads a
 * collection (its rendered cards only show which card fields the source uses), `contact-form` reads the detected
 * form, and `other` is the fallback.
 */
export const SLOTLESS_ARCHETYPES = ['post-list', 'contact-form', 'other'] as const satisfies readonly Archetype[]

/** What the engine reads from a slot's node: its text, its image, its link (label + target) or its icon. */
export type RegionSlotKind = 'text' | 'image' | 'link' | 'icon'

/**
 * A grounded reference: content comes from this outline node, never from the model.
 *
 * `node` is the pre-order (document order) index of the element in the template's outline at the reference width,
 * the root being 0. The narrower widths describe the same document, so one number names the element at every width.
 */
export interface SlotRef {
  node: number
  /** Image slots only: the image is the node's background image, not its own source. */
  background?: true
}

/**
 * One repeated item of a region. The names are generic on purpose; each archetype reads them the same way:
 *
 * | archetype     | media  | title     | text        | meta         | value            | other                   |
 * |---------------|--------|-----------|-------------|--------------|------------------|-------------------------|
 * | card-grid     | image  | title     | description |              |                  | icon, link              |
 * | stats         |        | label     | description |              | the figure       | icon                    |
 * | testimonial   | avatar | name      | quote       | role/company | rating (as text) |                         |
 * | pricing       |        | plan name | description | period       | price            | points = features, link |
 * | team          | photo  | name      | bio         | role         |                  | links = profiles        |
 * | timeline      |        | title     | text        | date or step |                  |                         |
 * | faq           |        | question  | answer      |              |                  |                         |
 * | gallery, logo-strip, slider | image | caption |     |              |                  | link                    |
 *
 * `value` names the smallest node whose text holds the whole figure with its prefix and suffix ("250+", "$19").
 */
export interface RegionItem {
  media?: SlotRef
  icon?: SlotRef
  title?: SlotRef
  text?: SlotRef
  meta?: SlotRef
  value?: SlotRef
  link?: SlotRef
  /** A short list inside the item (a plan's features). */
  points?: SlotRef[]
  /** Several links inside the item (a person's profiles). */
  links?: SlotRef[]
}

/** A titled group of lines and links: a footer column, a contact block. */
export interface RegionGroup {
  title?: SlotRef
  text?: SlotRef[]
  links?: SlotRef[]
}

export interface RegionSlots {
  eyebrow?: SlotRef
  heading?: SlotRef
  lead?: SlotRef
  /** Running text under the heading, one ref per block (paragraph, list). */
  body?: SlotRef[]
  media?: SlotRef
  items?: RegionItem[]
  actions?: SlotRef[]
  /** Header and footer. `nav` names the top-level entries as shown; the menu tree itself comes from the facts. */
  logo?: SlotRef
  nav?: SlotRef[]
  /** Secondary links of a header or footer bar (phone, email, legal). */
  utility?: SlotRef[]
  social?: SlotRef[]
  groups?: RegionGroup[]
  copyright?: SlotRef
}

/** A slot's kind and whether it holds one ref or a list. */
export interface RegionSlotDef { kind: RegionSlotKind, many: boolean }

const one = (kind: RegionSlotKind): RegionSlotDef => ({ kind, many: false })
const many = (kind: RegionSlotKind): RegionSlotDef => ({ kind, many: true })

/** The slot vocabulary as data: a prompt, a schema and the validator all read these, so they cannot drift apart. */
export const REGION_SLOT_DEFS: Record<Exclude<keyof RegionSlots, 'items' | 'groups'>, RegionSlotDef> = {
  eyebrow: one('text'),
  heading: one('text'),
  lead: one('text'),
  body: many('text'),
  media: one('image'),
  actions: many('link'),
  logo: one('image'),
  nav: many('link'),
  utility: many('link'),
  social: many('link'),
  copyright: one('text'),
}
export const REGION_ITEM_SLOT_DEFS: Record<keyof RegionItem, RegionSlotDef> = {
  media: one('image'),
  icon: one('icon'),
  title: one('text'),
  text: one('text'),
  meta: one('text'),
  value: one('text'),
  link: one('link'),
  points: many('text'),
  links: many('link'),
}
export const REGION_GROUP_SLOT_DEFS: Record<keyof RegionGroup, RegionSlotDef> = {
  title: one('text'),
  text: many('text'),
  links: many('link'),
}

/** What a still capture cannot hold: the region shows one state of something that moves or opens. */
export const DYNAMIC_STATES = ['slider', 'tabs', 'accordion', 'counter', 'hover', 'animation', 'video', 'embed'] as const
export type DynamicState = (typeof DYNAMIC_STATES)[number]

/**
 * What one region of a band is and where its content lives. Content-only: no colour, size or layout value is asked
 * from the model; those are measured (`Band.style`) or derived from the slot nodes' boxes.
 */
export interface RegionSpec {
  /** `Band.id`. */
  band: string
  /** Position inside the band, from 0. A band usually holds one region; a heading line over a grid may be two. */
  part: number
  archetype: Archetype
  /** 0..1. Below `UNDERSTAND_MIN_CONFIDENCE` the region is built as the styled fallback section. */
  confidence: number
  slots: RegionSlots
  /**
   * Slots the model saw but could not tie to a node (text inside an image, a CSS glyph, an off-screen slide), as slot
   * paths with or without indexes: `media`, `items.icon`, `items.2.icon`. Reported, never filled in.
   */
  ungrounded: string[]
  /** JS-made states seen in the region: a loss of state, reported apart from a loss of design. */
  dynamic?: DynamicState[]
  /** Region id (`regionId`) of a region with the same structure: both share one component. Points at a region that has no `sameAs` itself. */
  sameAs?: string
  /** Region id of the region in an earlier band of the same template that this one carries on (a footer in three bands). */
  continues?: string
}

/** A region's id: unique in a run, the value `sameAs` and `continues` hold. */
export function regionId(spec: Pick<RegionSpec, 'band' | 'part'>): string {
  return `${spec.band}#${spec.part}`
}

/** Below this confidence a region is not trusted to be its archetype. */
export const UNDERSTAND_MIN_CONFIDENCE = 0.5

/** The region is built as the styled fallback section (never as unstyled prose). */
export function needsFallback(spec: Pick<RegionSpec, 'archetype' | 'confidence'>): boolean {
  return spec.archetype === 'other' || !(spec.confidence >= UNDERSTAND_MIN_CONFIDENCE)
}

// ─── Fidelity ───

export const FIDELITIES = ['modern', 'middle', 'faithful'] as const
/**
 * How close the rebuilt page stays to the source's layout. `modern`: the kit's own layout, only the design tokens
 * carry over. `middle`: `MeasuredStyle` passes through as component parameters. `faithful`: reserved.
 */
export type Fidelity = (typeof FIDELITIES)[number]

// ─── Run record ───

/** One model reading, real or replayed from a stored response. */
export interface UnderstandCall {
  template: string
  /** The bands the reading covered. */
  bands: string[]
  /** Hash of the whole request (model, instructions, images, outline text): the key a stored response is replayed by. */
  promptHash: string
  model: string
  inputTokens: number
  /** The part of `inputTokens` read from the prompt cache. */
  cachedInputTokens: number
  outputTokens: number
  /** 0 when replayed. */
  usd: number
  replayed: boolean
}

export interface UnderstandRun {
  /** Only regions that passed `validateRegionSpecs`. A band with no region here gets the styled fallback section. */
  specs: RegionSpec[]
  /** Everything that was rejected, and why. */
  issues: UnderstandIssue[]
  /** Sum of `ledger[].usd`. */
  usd: number
  /** Readings that reached the model (`replayed` false). */
  calls: number
  model: string
  ledger: UnderstandCall[]
}

// ─── Validation ───

export const UNDERSTAND_ISSUE_CODES = [
  'bad_band', 'unknown_band', 'duplicate_region', 'unknown_archetype', 'bad_confidence', 'unknown_slot', 'bad_slot',
  'node_outside_band', 'background_not_image', 'slot_unresolved', 'missing_items', 'empty_region', 'bad_ungrounded',
  'bad_dynamic', 'bad_same_as', 'bad_continues',
] as const
export type UnderstandIssueCode = (typeof UNDERSTAND_ISSUE_CODES)[number]

export interface UnderstandIssue {
  code: UnderstandIssueCode
  band: string
  /** Absent on a band issue. */
  part?: number
  /** Slot path with indexes: `heading`, `items.2.title`, `groups.0.links.1`. */
  slot?: string
  message: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isIndex(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function isBox(value: unknown): value is Box {
  return isRecord(value)
    && [value['x'], value['y']].every(n => typeof n === 'number' && Number.isFinite(n))
    && [value['w'], value['h']].every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0)
}

/**
 * Checks the facts side of the contract: unique ids, a box at the reference width, and node ranges that ascend with
 * the order inside a template. Empty result: the bands are safe to hand to the understanding stage.
 */
export function validateBands(bands: readonly Band[]): UnderstandIssue[] {
  const issues: UnderstandIssue[] = []
  const bad = (band: string, message: string) => issues.push({ code: 'bad_band', band, message })
  const ids = new Set<string>()
  const byTemplate = new Map<string, Band[]>()
  for (const band of bands) {
    const id = typeof band.id === 'string' ? band.id : ''
    if (!id || id.includes('#')) bad(id, 'A band id is a non-empty string without "#".')
    else if (ids.has(id)) bad(id, 'Two bands share this id.')
    ids.add(id)
    if (typeof band.template !== 'string' || !band.template) bad(id, 'A band names its template.')
    if (!isIndex(band.order)) bad(id, 'A band\'s order is a whole number from 0.')
    if (!isRecord(band.boxes) || !isBox(band.boxes[UNDERSTAND_REFERENCE_WIDTH])) bad(id, `A band has a box at ${UNDERSTAND_REFERENCE_WIDTH}.`)
    else if (Object.entries(band.boxes).some(([width, box]) => !(UNDERSTAND_WIDTHS as readonly number[]).includes(Number(width)) || !isBox(box))) bad(id, `A band's boxes are keyed by ${UNDERSTAND_WIDTHS.join(', ')}.`)
    if (!isRecord(band.nodes) || !isIndex(band.nodes.first) || !isIndex(band.nodes.last) || band.nodes.first > band.nodes.last) {
      bad(id, 'A band\'s node range is two whole numbers, first ≤ last.')
      continue
    }
    if (!isRecord(band.style)) bad(id, 'A band carries its measured style (an empty object when nothing was measured).')
    byTemplate.set(band.template, [...(byTemplate.get(band.template) ?? []), band])
  }
  for (const group of byTemplate.values()) {
    const ordered = group.toSorted((a, b) => a.order - b.order)
    for (let i = 1; i < ordered.length; i++) {
      const [prev, band] = [ordered[i - 1]!, ordered[i]!]
      if (band.order === prev.order) bad(band.id, `Bands ${prev.id} and ${band.id} share an order.`)
      else if (band.nodes.first <= prev.nodes.last) bad(band.id, `The node range overlaps band ${prev.id}'s.`)
    }
  }
  return issues
}

type RefVisitor = (ref: SlotRef, kind: RegionSlotKind, path: string) => void
type ProblemVisitor = (code: 'unknown_slot' | 'bad_slot', path: string, message: string) => void

function isSlotRef(value: unknown): value is SlotRef {
  return isRecord(value) && isIndex(value['node'])
    && Object.keys(value).every(key => key === 'node' || (key === 'background' && (value[key] === true || value[key] === undefined)))
}

/** Walks one slot holder in the table's order, so the visiting order never depends on the input's key order. */
function walkHolder(holder: Record<string, unknown>, defs: Record<string, RegionSlotDef>, prefix: string, nested: readonly string[], visit: RefVisitor, problem: ProblemVisitor): void {
  const visitRef = (value: unknown, kind: RegionSlotKind, path: string) => {
    if (isSlotRef(value)) visit(value, kind, path)
    else problem('bad_slot', path, 'A slot is { node } with a whole-number node id, and at most background: true.')
  }
  for (const [name, def] of Object.entries(defs)) {
    const value = holder[name]
    if (value === undefined) continue
    const path = `${prefix}${name}`
    if (!def.many) visitRef(value, def.kind, path)
    else if (!Array.isArray(value)) problem('bad_slot', path, 'This slot holds a list of refs.')
    else value.forEach((ref, i) => visitRef(ref, def.kind, `${path}.${i}`))
  }
  for (const name of Object.keys(holder)) {
    if (!(name in defs) && !nested.includes(name) && holder[name] !== undefined) problem('unknown_slot', `${prefix}${name}`, 'No such slot.')
  }
}

function walkSlots(slots: unknown, visit: RefVisitor, problem: ProblemVisitor): void {
  if (!isRecord(slots)) {
    problem('bad_slot', 'slots', 'A region\'s slots are an object.')
    return
  }
  walkHolder(slots, REGION_SLOT_DEFS, '', ['items', 'groups'], visit, problem)
  const lists = [['items', REGION_ITEM_SLOT_DEFS], ['groups', REGION_GROUP_SLOT_DEFS]] as const
  for (const [name, defs] of lists) {
    const list = slots[name]
    if (list === undefined) continue
    if (!Array.isArray(list)) {
      problem('bad_slot', name, 'This slot holds a list.')
      continue
    }
    list.forEach((entry, i) => {
      if (!isRecord(entry) || Object.values(entry).every(value => value === undefined)) problem('bad_slot', `${name}.${i}`, 'An entry holds at least one slot.')
      else walkHolder(entry, defs, `${name}.${i}.`, [], visit, problem)
    })
  }
}

/**
 * Visits every ref of a region with its kind and its path (`heading`, `items.2.title`), in a fixed order: the region's
 * own slots, then its items, then its groups. Malformed slots are skipped; `validateRegionSpecs` reports them.
 */
export function forEachSlot(spec: Pick<RegionSpec, 'slots'>, visit: (ref: SlotRef, kind: RegionSlotKind, path: string) => void): void {
  walkSlots(spec.slots, visit, () => {})
}

const SLOT_PATHS: ReadonlySet<string> = new Set([
  ...Object.keys(REGION_SLOT_DEFS),
  'items',
  ...Object.keys(REGION_ITEM_SLOT_DEFS).map(name => `items.${name}`),
  'groups',
  ...Object.keys(REGION_GROUP_SLOT_DEFS).map(name => `groups.${name}`),
])

/** `items.2.icon` → `items.icon`. */
function slotPathOf(path: string): string {
  return path.split('.').filter(part => !/^\d+$/.test(part)).join('.')
}

export interface ValidateRegionSpecsOptions {
  /**
   * The outline's answer to "does this node hold what the slot's kind needs?" (a text, an image address, a link with
   * a label or a target, an icon). The outline lives with the engine, so the engine passes this in; without it only
   * the structure is checked.
   */
  resolves?: (ref: SlotRef, kind: RegionSlotKind, band: Band) => boolean
}

/**
 * The gate between the model and the engine. Every region must name a known band, a known archetype and slots from
 * the vocabulary; every ref must lie inside its band's node range and, when `resolves` is given, hold content of its
 * kind. A region with an issue must not reach the plan: it goes to `UnderstandRun.issues`, not to `specs`.
 *
 * Empty result: every region is safe to build from.
 */
export function validateRegionSpecs(specs: readonly RegionSpec[], bands: readonly Band[], options: ValidateRegionSpecsOptions = {}): UnderstandIssue[] {
  const issues: UnderstandIssue[] = []
  const bandById = new Map(bands.map(band => [band.id, band]))
  const specById = new Map<string, RegionSpec>()
  for (const spec of specs) {
    const id = regionId(spec)
    if (!specById.has(id)) specById.set(id, spec)
  }
  const seen = new Set<string>()

  for (const spec of specs) {
    const band = bandById.get(spec.band)
    const add = (code: UnderstandIssueCode, message: string, slot?: string) =>
      issues.push({ code, band: String(spec.band), ...(isIndex(spec.part) ? { part: spec.part } : {}), ...(slot === undefined ? {} : { slot }), message })
    if (!band) {
      add('unknown_band', 'The region names a band that is not in the run.')
      continue
    }
    const id = regionId(spec)
    if (!isIndex(spec.part)) add('duplicate_region', 'A region\'s part is a whole number from 0.')
    else if (seen.has(id)) add('duplicate_region', 'Two regions share this band and part.')
    seen.add(id)

    const known = (ARCHETYPES as readonly string[]).includes(spec.archetype)
    if (!known) add('unknown_archetype', `"${String(spec.archetype)}" is not an archetype.`)
    if (typeof spec.confidence !== 'number' || !(spec.confidence >= 0 && spec.confidence <= 1)) add('bad_confidence', 'Confidence is a number from 0 to 1.')

    let refs = 0
    walkSlots(spec.slots, (ref, kind, path) => {
      refs++
      if (ref.background && kind !== 'image') add('background_not_image', 'Only an image slot can read a background.', path)
      if (ref.node < band.nodes.first || ref.node > band.nodes.last) add('node_outside_band', `Node ${ref.node} is outside the band's nodes (${band.nodes.first}–${band.nodes.last}).`, path)
      else if (options.resolves && !options.resolves(ref, kind, band)) add('slot_unresolved', `Node ${ref.node} holds no ${kind}.`, path)
    }, (code, path, message) => {
      refs++
      add(code, message, path)
    })

    if (known) {
      const items = isRecord(spec.slots) ? spec.slots['items'] : undefined
      if ((ITEM_ARCHETYPES as readonly string[]).includes(spec.archetype) && !(Array.isArray(items) && items.length > 0)) add('missing_items', `A ${spec.archetype} needs at least one item.`, 'items')
      else if (refs === 0 && !(SLOTLESS_ARCHETYPES as readonly string[]).includes(spec.archetype)) add('empty_region', `A ${spec.archetype} needs at least one slot.`)
    }

    if (!Array.isArray(spec.ungrounded)) add('bad_ungrounded', 'ungrounded is a list of slot paths (empty when everything is grounded).')
    else {
      for (const path of spec.ungrounded) {
        if (typeof path !== 'string' || !SLOT_PATHS.has(slotPathOf(path))) add('bad_ungrounded', `"${String(path)}" is not a slot path.`)
      }
    }
    if (spec.dynamic !== undefined && !(Array.isArray(spec.dynamic) && spec.dynamic.every(state => (DYNAMIC_STATES as readonly string[]).includes(state)))) add('bad_dynamic', `dynamic is a list of: ${DYNAMIC_STATES.join(', ')}.`)

    if (spec.sameAs !== undefined) {
      const target = specById.get(spec.sameAs)
      if (!target || spec.sameAs === id) add('bad_same_as', 'sameAs names another region of the run.')
      else if (target.archetype !== spec.archetype) add('bad_same_as', 'sameAs joins regions of one archetype.')
      else if (target.sameAs !== undefined) add('bad_same_as', 'sameAs points at a region that has no sameAs itself.')
    }
    if (spec.continues !== undefined) {
      const target = specById.get(spec.continues)
      const targetBand = target && bandById.get(target.band)
      if (!targetBand) add('bad_continues', 'continues names another region of the run.')
      else if (targetBand.template !== band.template || !(targetBand.order < band.order)) add('bad_continues', 'continues points at a region in an earlier band of the same template.')
    }
  }
  return issues
}

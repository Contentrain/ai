// ─── Golden handoff ───
//
// The document Contentrain Migrate writes for a delivery, after the delivery stamped it — the one
// shape the producer and every reader (Studio) must agree on. It is published from this package so
// both sides test against the same bytes instead of each keeping a copy: Migrate asserts that its
// builder + delivery stamp produce exactly this, Studio asserts that its reader accepts it.
//
// Typed as `MigrationHandoff`, so the contract itself fails to build when the interface and this
// document drift apart. Treat it as read-only (copy with `structuredClone` before changing a field).
// Changing the producer's output means changing this document first, which means a release of this
// package — that ordering is the point.

import type { MigrationHandoff } from './migration.js'

export const MIGRATION_HANDOFF_GOLDEN: MigrationHandoff = {
  version: 1,
  site_url: 'https://site.test',
  generated_at: '2026-09-09T10:00:00.000Z',
  plan_hash: '3f9a1c2b7d4e8a60',
  order_id: 'ord_0123456789abcdef01234567',
  content_summary: {
    models: 4,
    entries: 131,
    locales: [
      'tr',
    ],
  },
  capabilities: [
    {
      key: 'forms',
      disposition: 'needs_runtime',
      detail: 'works on the new site once connected to Studio; until then no form shows on the new site (contact-form-7)',
    },
    {
      key: 'comments',
      disposition: 'needs_runtime',
      detail: 'works on the new site once connected to Studio; until then no comments show on the new site',
      counts: {
        total: 2,
        mapped: 1,
        unresolved: 1,
      },
    },
    {
      key: 'i18n',
      disposition: 'migrated_static',
      detail: 'one family per language, the locale on routes (polylang)',
      counts: {
        locales: 1,
      },
    },
    {
      key: 'ecommerce',
      disposition: 'needs_runtime',
      detail: 'the shop is not part of the move; it stays on the WordPress server (woocommerce)',
    },
  ],
  comments: {
    total: 2,
    by_status: {
      '0': 1,
      '1': 1,
    },
    types: {
      comment: 2,
    },
    export: {
      format: 'contentrain-comments@1',
    },
    threads_closed: [11],
    unresolved: [
      {
        comment_id: 2,
        post: 99,
        reason: 'post has no entry mapping',
      },
    ],
  },
  offers: [
    {
      capability: 'comments',
      provider: 'studio_managed',
    },
    {
      capability: 'comments',
      provider: 'keep_wordpress',
      warning: 'if comments stay on WordPress the old server stays live — its maintenance, security and hosting costs continue',
    },
    {
      capability: 'forms',
      provider: 'studio_managed',
    },
    {
      capability: 'forms',
      provider: 'keep_wordpress',
      warning: 'if forms stay on WordPress submissions go to the old server; the server and the form plugin stay live',
    },
    {
      capability: 'ecommerce',
      provider: 'keep_wordpress',
      warning: 'if the shop stays on WordPress, WooCommerce and the payment setup keep running on the old server',
    },
  ],
  runtime: {
    base_url: 'https://studio.test',
    project_id: 'p1',
  },
  notes: [
    'build passed · quality gate passed',
    'visual fidelity: post median 97.6 (1280 px)',
    '6 families · 7 routes · 120 posts · 9 pages',
    'content store: 4 models · 131 entries (.contentrain, @contentrain/wp-import) · TRUNCATED: media 3/12',
    'runtime addresses: 128 routes bound · 1 COULD NOT BE BOUND',
    'store media: 12 URLs rewritten to local paths · 300 old-origin URLs remain (media move: Studio)',
    'form model: contact (4 fields, cf7) — takes submissions once the form block is opened in Studio',
    'editability: 5/7 routes render their content from data · 2 routes NOT EDITABLE (content baked into the chrome) · 2 fields are carried in the data but not rendered',
    'family generality: 3/5 families proven against the live site · not proven: category (weak), page-solo-0 (single-sample)',
    'component mount points: c-comments (comments, 1 family) · c-contact (form, 1 family) · bound to Studio: https://studio.test / p1',
    'comments: 2 (approved 1 · pending 1) · export inline · 1 closed thread · 1 unmatched',
    'comments export: stays out of Git — the comments are in the delivery package (receipt) and move to Studio through Migrate',
  ],
  repository: {
    provider: 'github',
    owner: 'acme',
    name: 'site',
    default_branch: 'main',
  },
}

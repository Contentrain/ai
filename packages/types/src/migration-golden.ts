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
      detail: "Studio'ya bağlanınca yeni sitede çalışır; bağlanana dek yeni sitede form görünmez (contact-form-7)",
    },
    {
      key: 'comments',
      disposition: 'needs_runtime',
      detail: "Studio'ya bağlanınca yeni sitede çalışır; bağlanana dek yeni sitede yorum görünmez",
      counts: {
        total: 2,
        mapped: 1,
        unresolved: 1,
      },
    },
    {
      key: 'i18n',
      disposition: 'migrated_static',
      detail: "dil başına aile, route'larda locale (polylang)",
      counts: {
        locales: 1,
      },
    },
    {
      key: 'ecommerce',
      disposition: 'needs_runtime',
      detail: 'mağaza taşımaya dahil değil; WordPress sunucusunda kalır (woocommerce)',
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
      warning: "yorumlar WordPress'te kalırsa eski sunucu canlı kalır — bakım, güvenlik ve barındırma maliyeti sürer",
    },
    {
      capability: 'forms',
      provider: 'studio_managed',
    },
    {
      capability: 'forms',
      provider: 'keep_wordpress',
      warning: "formlar WordPress'te kalırsa gönderimler eski sunucuya gider; sunucu ve form eklentisi canlı kalır",
    },
    {
      capability: 'ecommerce',
      provider: 'keep_wordpress',
      warning: "mağaza WordPress'te kalırsa WooCommerce ve ödeme altyapısı eski sunucuda çalışmaya devam eder",
    },
  ],
  runtime: {
    base_url: 'https://studio.test',
    project_id: 'p1',
  },
  notes: [
    'derleme başarılı · kalite kapısı geçti',
    'görsel sadakat: yazı medyanı 97.6 (1280 px)',
    '6 aile · 7 route · 120 yazı · 9 sayfa',
    'içerik mağazası: 4 model · 131 kayıt (.contentrain, @contentrain/wp-import) · KESİLDİ: media 3/12',
    'çalışma zamanı adresleri: 128 route bağlandı · 1 BAĞLANAMADI',
    'mağaza medyası: 12 URL yerel yola çevrildi · 300 eski-origin URL kaldı (medya taşıma: Studio)',
    "form modeli: contact (4 alan, cf7) — Studio'da form bloğu açılınca gönderim alır",
    "düzenlenebilirlik: 5/7 route içeriği veriden · 2 route DÜZENLENEMEZ (içerik chrome'a pişmiş) · 2 alan veride taşınıyor ama basılmıyor",
    'aile genelliği: 3/5 aile canlıya karşı kanıtlandı · kanıtlanmayan: category (weak), page-solo-0 (single-sample)',
    "bileşen mount noktaları: c-comments (comments, 1 aile) · c-contact (form, 1 aile) · Studio'ya bağlı: https://studio.test / p1",
    'yorumlar: 2 (onaylı 1 · bekleyen 1) · dışa aktarım satır içi · 1 kapalı thread · 1 eşlenmeyen',
    "yorum dışa aktarımı Git'e girmez — yorumlar teslim paketinde (makbuz), Studio'ya Migrate üzerinden aktarılır",
  ],
  repository: {
    provider: 'github',
    owner: 'acme',
    name: 'site',
    default_branch: 'main',
  },
}

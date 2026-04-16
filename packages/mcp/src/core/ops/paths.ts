import type { ModelDefinition } from '@contentrain/types'

/**
 * Content-root-relative path helpers for plan-API consumers.
 *
 * These mirror the logic inside `core/content-manager.ts:resolveJsonFilePath`
 * but return forward-slash relative strings suitable for `FileChange.path`.
 * Providers are responsible for resolving these against their backing store
 * (worktree on disk for LocalProvider, git tree path for GitHubProvider, ...).
 *
 * Kept inline to `core/ops/` for now; when Faz 2 finishes migrating every op
 * the legacy absolute-path helpers in `core/content-manager.ts` and
 * `core/meta-manager.ts` will call into these (or be replaced entirely).
 */

function contentDir(model: Pick<ModelDefinition, 'domain' | 'id' | 'content_path'>): string {
  if (model.content_path) return model.content_path
  return `.contentrain/content/${model.domain}/${model.id}`
}

export function contentFilePath(
  model: Pick<ModelDefinition, 'id' | 'kind' | 'domain' | 'i18n' | 'content_path' | 'locale_strategy'>,
  locale: string,
): string {
  const dir = contentDir(model)
  if (!model.i18n) return `${dir}/data.json`
  const strategy = model.locale_strategy ?? 'file'
  switch (strategy) {
    case 'suffix': return `${dir}/${model.id}.${locale}.json`
    case 'directory': return `${dir}/${locale}/${model.id}.json`
    case 'none': return `${dir}/${model.id}.json`
    default: return `${dir}/${locale}.json`
  }
}

export function documentFilePath(
  model: Pick<ModelDefinition, 'id' | 'domain' | 'i18n' | 'content_path' | 'locale_strategy'>,
  locale: string,
  slug: string,
): string {
  const dir = contentDir(model)
  if (!model.i18n) return `${dir}/${slug}.md`
  const strategy = model.locale_strategy ?? 'file'
  switch (strategy) {
    case 'suffix': return `${dir}/${slug}.${locale}.md`
    case 'directory': return `${dir}/${locale}/${slug}.md`
    case 'none': return `${dir}/${slug}.md`
    default: return `${dir}/${slug}/${locale}.md`
  }
}

export function metaFilePath(
  model: Pick<ModelDefinition, 'id' | 'kind'>,
  locale: string,
  slug?: string,
): string {
  const base = `.contentrain/meta/${model.id}`
  if (model.kind === 'document' && slug) {
    return `${base}/${slug}/${locale}.json`
  }
  return `${base}/${locale}.json`
}

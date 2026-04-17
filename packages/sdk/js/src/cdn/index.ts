import { HttpTransport } from './http-transport.js'
import { CdnCollectionQuery } from './collection-query.js'
import { CdnSingletonAccessor } from './singleton-accessor.js'
import { CdnDictionaryAccessor } from './dictionary-accessor.js'
import { CdnDocumentQuery } from './document-query.js'
import { MediaAccessor } from './media-accessor.js'
import { FormsClient } from './forms-client.js'
import { ConversationClient } from './conversation-client.js'

export interface ContentrainCDNConfig {
  projectId: string
  apiKey: string
  baseUrl?: string
  defaultLocale?: string
}

export type ContentrainCDNClient = ReturnType<typeof createContentrain>

export function createContentrain(config: ContentrainCDNConfig) {
  const transport = new HttpTransport({
    baseUrl: config.baseUrl ?? 'https://studio.contentrain.io/api/cdn/v1',
    projectId: config.projectId,
    apiKey: config.apiKey,
  })
  const defaultLocale = config.defaultLocale

  return {
    collection: <T extends object = Record<string, unknown>>(modelId: string) =>
      new CdnCollectionQuery<T>(transport, modelId, defaultLocale),

    singleton: <T extends Record<string, unknown> = Record<string, unknown>>(modelId: string) =>
      new CdnSingletonAccessor<T>(transport.singleton<T>(modelId), defaultLocale),

    dictionary: (modelId: string) =>
      new CdnDictionaryAccessor(transport.dictionary(modelId), defaultLocale),

    document: <T extends object = Record<string, unknown>>(modelId: string) =>
      new CdnDocumentQuery<T>(transport.document<T>(modelId), defaultLocale),

    media: () => new MediaAccessor(transport),

    form: () => new FormsClient({
      baseUrl: (config.baseUrl ?? 'https://studio.contentrain.io/api/cdn/v1').replace('/cdn/v1', '/forms/v1'),
      projectId: config.projectId,
      apiKey: config.apiKey,
    }),

    conversation: () => new ConversationClient({
      baseUrl: (config.baseUrl ?? 'https://studio.contentrain.io/api/cdn/v1').replace('/cdn/v1', '/conversation/v1'),
      projectId: config.projectId,
      apiKey: config.apiKey,
    }),

    manifest: () => transport.fetch<unknown>('_manifest.json'),
    models: () => transport.fetch<unknown[]>('models/_index.json'),
    model: (id: string) => transport.fetch<unknown>(`models/${id}.json`),
  }
}

// Re-exports
export { ContentrainError } from './errors.js'
export type { CollectionDataSource, SingletonDataSource, DictionaryDataSource, DocumentDataSource } from './data-source.js'
export { HttpTransport } from './http-transport.js'
export { CdnCollectionQuery } from './collection-query.js'
export { CdnSingletonAccessor } from './singleton-accessor.js'
export { CdnDictionaryAccessor } from './dictionary-accessor.js'
export { CdnDocumentQuery } from './document-query.js'
export { MediaAccessor } from './media-accessor.js'
export type { MediaAsset, MediaAssetMeta, MediaManifest } from './media-accessor.js'
export { FormsClient } from './forms-client.js'
export type { FormConfig, FormFieldConfig, FormSubmitResult, FormsClientConfig } from './forms-client.js'
export { ConversationClient } from './conversation-client.js'
export type {
  ConversationClientConfig,
  ConversationContext,
  ConversationSendOptions,
  ConversationResponse,
  ConversationToolResult,
  ConversationUsage,
  ConversationMessage,
  ConversationHistory,
} from './conversation-client.js'

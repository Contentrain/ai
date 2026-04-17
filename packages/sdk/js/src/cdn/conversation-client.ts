import { ContentrainError } from './errors.js'

export interface ConversationContext {
  activeModelId?: string | null
  activeLocale?: string
  activeEntryId?: string | null
  panelState?: string
  activeBranch?: string | null
}

export interface ConversationSendOptions {
  conversationId?: string
  context?: ConversationContext
}

export interface ConversationToolResult {
  id: string
  name: string
  result: unknown
}

export interface ConversationUsage {
  inputTokens: number
  outputTokens: number
}

export interface ConversationResponse {
  conversationId: string
  message: string
  toolResults?: ConversationToolResult[]
  usage: ConversationUsage
}

export interface ConversationMessage {
  id: string
  role: 'user' | 'assistant'
  content: string | unknown[]
  toolCalls?: unknown[]
  model?: string
  usage?: ConversationUsage
  createdAt: string
}

export interface ConversationHistory {
  conversationId: string
  messages: ConversationMessage[]
}

export interface ConversationClientConfig {
  baseUrl: string
  projectId: string
  apiKey: string
}

export class ConversationClient {
  private _baseUrl: string
  private _projectId: string
  private _apiKey: string

  constructor(config: ConversationClientConfig) {
    this._baseUrl = config.baseUrl.replace(/\/+$/, '')
    this._projectId = config.projectId
    this._apiKey = config.apiKey
  }

  async send(message: string, options?: ConversationSendOptions): Promise<ConversationResponse> {
    const url = `${this._baseUrl}/${this._projectId}/message`

    const body: Record<string, unknown> = { message }
    if (options?.conversationId) body.conversationId = options.conversationId
    if (options?.context) body.context = options.context

    const res = await globalThis.fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this._apiKey}`,
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      throw new ContentrainError(res.status, await res.text())
    }

    return (await res.json()) as ConversationResponse
  }

  async history(conversationId: string, options?: { limit?: number }): Promise<ConversationHistory> {
    const params = new URLSearchParams({ conversationId })
    if (options?.limit) params.set('limit', String(options.limit))

    const url = `${this._baseUrl}/${this._projectId}/history?${params}`

    const res = await globalThis.fetch(url, {
      headers: {
        'Authorization': `Bearer ${this._apiKey}`,
      },
    })

    if (!res.ok) {
      throw new ContentrainError(res.status, await res.text())
    }

    return (await res.json()) as ConversationHistory
  }
}

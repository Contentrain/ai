import { ContentrainError } from './errors.js'

export interface FormFieldConfig {
  id: string
  type: string
  required?: boolean
  label?: string
  placeholder?: string
  options?: Array<{ value: string; label: string }>
  pattern?: string
  min?: number
  max?: number
}

export interface FormConfig {
  modelId: string
  fields: FormFieldConfig[]
  captchaType?: 'turnstile' | null
  successMessage?: string
  honeypotField?: string
}

export interface FormSubmitResult {
  success: boolean
  message?: string
  errors?: Array<{ field: string; message: string }>
}

export interface FormsClientConfig {
  baseUrl: string
  projectId: string
  apiKey?: string
}

export class FormsClient {
  private _baseUrl: string
  private _projectId: string
  private _apiKey: string | undefined

  constructor(config: FormsClientConfig) {
    this._baseUrl = config.baseUrl.replace(/\/+$/, '')
    this._projectId = config.projectId
    this._apiKey = config.apiKey
  }

  async config(modelId: string): Promise<FormConfig> {
    const url = `${this._baseUrl}/${this._projectId}/${modelId}/config`
    const headers: Record<string, string> = {}
    if (this._apiKey) headers['Authorization'] = `Bearer ${this._apiKey}`

    const res = await globalThis.fetch(url, { headers })
    if (!res.ok) throw new ContentrainError(res.status, await res.text())
    return (await res.json()) as FormConfig
  }

  async submit(modelId: string, data: Record<string, unknown>, options?: {
    captchaToken?: string
  }): Promise<FormSubmitResult> {
    const url = `${this._baseUrl}/${this._projectId}/${modelId}/submit`
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (this._apiKey) headers['Authorization'] = `Bearer ${this._apiKey}`

    const body: Record<string, unknown> = { ...data }
    if (options?.captchaToken) {
      body['cf-turnstile-response'] = options.captchaToken
    }

    const res = await globalThis.fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })

    const result = (await res.json()) as FormSubmitResult

    if (!res.ok && !result.errors) {
      throw new ContentrainError(res.status, result.message ?? 'Form submission failed')
    }

    return result
  }
}

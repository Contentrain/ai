// Public forms client — the browser side of Studio's `/api/forms/v1`.
//
// Contract (Studio docs/FORMS.md):
//   GET  {base}/{projectId}/{modelId}/config  → FormConfig
//   POST {base}/{projectId}/{modelId}/submit  { data, captchaToken?, _hp? } → FormSubmitResult
//
// `fields` is a map keyed by field id (the model's own FieldDef shape), not a
// list; the captcha comes back as `captcha` + `captchaSiteKey`; the honeypot
// input's name is `honeypotField`. Submissions wrap the values in `data` so
// the control fields (`captchaToken`, `_hp`) can never collide with a model
// field. No credential is sent: the endpoints are public by design.

import type { FieldDef } from '@contentrain/types'
import { publicGet, publicPost, publicUrl } from './public-request.js'

/** One exposed field, as the model defines it. */
export type FormFieldConfig = FieldDef

export interface FormConfig {
  modelId: string
  /** The project's default locale — what a submission is validated against and written to. */
  locale: string
  /** Exposed fields only, keyed by field id. */
  fields: Record<string, FormFieldConfig>
  captcha: 'turnstile' | null
  /** Turnstile widget key, when `captcha` is set and the operator configured one. */
  captchaSiteKey: string | null
  successMessage?: string
  /** Name of the hidden honeypot input to render (and leave empty), or null. */
  honeypotField: string | null
}

export interface FormFieldError {
  field: string
  message: string
}

export interface FormSubmitResult {
  success: boolean
  /** The model's `successMessage` on success. */
  message?: string
  /** Validation errors against the exposed fields, or `captcha`. */
  errors?: FormFieldError[]
}

export interface FormSubmitOptions {
  /** Turnstile token, when the config's `captcha` is set. */
  captchaToken?: string
  /** Value of the honeypot input. A human leaves it empty; a filled one is silently dropped server-side. */
  honeypot?: string
}

export interface FormsClientConfig {
  /** Public API root — `https://studio.contentrain.io/api/forms/v1`. */
  baseUrl: string
  projectId: string
}

export class FormsClient {
  private _baseUrl: string
  private _projectId: string

  constructor(config: FormsClientConfig) {
    this._baseUrl = config.baseUrl.replace(/\/+$/, '')
    this._projectId = config.projectId
  }

  config(modelId: string): Promise<FormConfig> {
    return publicGet<FormConfig>(publicUrl(this._baseUrl, [this._projectId, modelId, 'config']))
  }

  /**
   * Resolves with the server's verdict for 2xx responses — including
   * `{ success: false, errors }` for validation failures, which are not
   * exceptions. Rejects with `ContentrainError` on 403/404/429/5xx.
   */
  submit(modelId: string, data: Record<string, unknown>, options?: FormSubmitOptions): Promise<FormSubmitResult> {
    const body: { data: Record<string, unknown>; captchaToken?: string; _hp?: string } = { data }
    if (options?.captchaToken) body.captchaToken = options.captchaToken
    if (options?.honeypot !== undefined) body._hp = options.honeypot
    return publicPost<FormSubmitResult>(publicUrl(this._baseUrl, [this._projectId, modelId, 'submit']), body)
  }
}

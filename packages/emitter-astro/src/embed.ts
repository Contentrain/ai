// The runtime-component client, emitted as `src/lib/embed.ts`.
//
// Kept as source text (like the fill runtime in scaffold.ts) so the generated
// site depends on nothing but Astro. The text is type-checked and executed by
// this package's tests — `embed.test.ts` writes it to disk and imports it, and
// `typecheck.test.ts` runs tsc over it with Astro's strict settings — so the
// code that ships is the code that was tested, escaping included.

export const EMBED_TS = `// Emitted by @contentrain/emitter-astro — the runtime-component client.
//
// Comments and forms are the two regions of a migrated site that need a live
// service. This module is the browser side of the provider's PUBLIC API
// (Studio: /api/forms/v1 and /api/comments/v1) — the same contract that
// @contentrain/query/cdn implements, inlined so the generated site depends on
// nothing but Astro. No credential travels with a request: the endpoints are
// unauthenticated by design, and a page cannot keep a secret.
//
// Rendering helpers are pure (strings in, HTML out, escaped by default) so the
// mount functions at the bottom are the only code that touches the DOM.

export interface Runtime {
  base_url: string
  project_id: string
}

export interface EntryRef {
  model_id: string
  entry_id: string
  locale?: string
}

export class EmbedError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'EmbedError'
    this.status = status
  }
}

/** Visitor-facing strings — override from the site (\`strings.send = 'Gönder'\`). */
export const strings = {
  loading: 'Loading…',
  send: 'Send',
  sending: 'Sending…',
  commentsTitle: 'Comments',
  noComments: 'No comments yet.',
  closed: 'Comments are closed.',
  postComment: 'Post comment',
  reply: 'Reply',
  replyingTo: 'Replying to',
  cancel: 'Cancel',
  loadMore: 'Load more comments',
  moderator: 'Moderator',
  pending: 'Thank you — your comment is awaiting moderation.',
  posted: 'Your comment has been posted.',
  name: 'Name',
  email: 'Email',
  emailNote: '(never shown)',
  website: 'Website',
  comment: 'Comment',
  failed: 'Something went wrong. Please try again.',
  honeypot: 'Leave this field empty',
}

export const esc = (value: unknown): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

// ─── Transport ───

/** \`base\` without a trailing slash, segments URL-encoded, empty query values dropped. */
export function publicUrl(base: string, segments: string[], query?: Record<string, string | number | undefined>): string {
  const path = segments.map((s) => encodeURIComponent(s)).join('/')
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== '') params.set(key, String(value))
  }
  const qs = params.toString()
  return base.replace(/\\/+$/, '') + '/' + path + (qs ? '?' + qs : '')
}

async function failure(res: Response): Promise<EmbedError> {
  const text = await res.text().catch(() => '')
  let message = text || 'Request failed'
  try {
    const parsed = JSON.parse(text) as { message?: unknown; statusMessage?: unknown }
    const m = parsed.message ?? parsed.statusMessage
    if (typeof m === 'string' && m) message = m
  } catch {
    // not JSON — the raw text is the message
  }
  return new EmbedError(res.status, message)
}

export async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw await failure(res)
  return (await res.json()) as T
}

export async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw await failure(res)
  return (await res.json()) as T
}

export const formsRoot = (rt: Runtime): string => rt.base_url.replace(/\\/+$/, '') + '/api/forms/v1'
export const commentsRoot = (rt: Runtime): string => rt.base_url.replace(/\\/+$/, '') + '/api/comments/v1'

/** The hidden input Cloudflare Turnstile adds to the enclosing form. */
export const CAPTCHA_FIELD = 'cf-turnstile-response'

// ─── Forms ───

export interface FieldDef {
  type: string
  required?: boolean
  label?: string
  options?: string[]
  min?: number
  max?: number
  pattern?: string
  default?: unknown
}

export interface FormConfig {
  modelId: string
  locale: string
  /** Exposed fields only, keyed by field id. */
  fields: Record<string, FieldDef>
  captcha: 'turnstile' | null
  captchaSiteKey: string | null
  successMessage?: string
  honeypotField: string | null
}

export interface FieldError {
  field: string
  message: string
}

export interface FormSubmitResult {
  success: boolean
  message?: string
  errors?: FieldError[]
}

/** The documented request body: values under \`data\`, control fields beside it. */
export interface FormPayload {
  data: Record<string, unknown>
  captchaToken?: string
  _hp?: string
}

export function fetchFormConfig(rt: Runtime, model: string): Promise<FormConfig> {
  return getJson<FormConfig>(publicUrl(formsRoot(rt), [rt.project_id, model, 'config']))
}

export function submitForm(rt: Runtime, model: string, payload: FormPayload): Promise<FormSubmitResult> {
  return postJson<FormSubmitResult>(publicUrl(formsRoot(rt), [rt.project_id, model, 'submit']), payload)
}

function coerce(def: FieldDef, value: string): unknown {
  switch (def.type) {
    case 'number':
    case 'integer':
    case 'decimal':
    case 'percent':
    case 'rating':
      return value === '' ? '' : Number(value)
    case 'boolean':
      return value === 'on' || value === 'true'
    default:
      return value
  }
}

/**
 * Form entries (\`new FormData(form)\`) → request body. Only exposed fields
 * reach \`data\`; the captcha token and the honeypot value travel beside it, so
 * a control field can never collide with a model field. Files are skipped —
 * uploads are not part of the public contract.
 */
export function formPayload(
  entries: Iterable<[string, unknown]>,
  config: { fields: Record<string, FieldDef>; honeypotField: string | null },
): FormPayload {
  const payload: FormPayload = { data: {} }
  for (const [name, raw] of entries) {
    if (typeof raw !== 'string') continue
    if (name === CAPTCHA_FIELD) {
      if (raw) payload.captchaToken = raw
      continue
    }
    if (config.honeypotField && name === config.honeypotField) {
      payload._hp = raw
      continue
    }
    const def = config.fields[name]
    if (!def) continue
    payload.data[name] = coerce(def, raw)
  }
  return payload
}

export function labelFor(id: string, def: FieldDef): string {
  if (def.label) return def.label
  const words = id.replace(/[_-]+/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** One input for one exposed field, chosen by field type. */
export function fieldControl(id: string, def: FieldDef, prefix = 'cr-field'): string {
  const common =
    ' id="' + esc(prefix + '-' + id) + '" name="' + esc(id) + '"' +
    (def.required ? ' required' : '') +
    (def.pattern ? ' pattern="' + esc(def.pattern) + '"' : '')
  const range =
    (def.min !== undefined ? ' min="' + esc(def.min) + '"' : '') +
    (def.max !== undefined ? ' max="' + esc(def.max) + '"' : '')
  const length = def.max !== undefined ? ' maxlength="' + esc(def.max) + '"' : ''
  switch (def.type) {
    case 'text':
    case 'markdown':
    case 'richtext':
    case 'code':
      return '<textarea' + common + length + ' rows="5"></textarea>'
    case 'select': {
      const blank = def.required ? '' : '<option value=""></option>'
      const options = (def.options ?? []).map((o) => '<option value="' + esc(o) + '">' + esc(o) + '</option>').join('')
      return '<select' + common + '>' + blank + options + '</select>'
    }
    case 'boolean':
      return '<input type="checkbox"' + common + ' />'
    case 'number':
    case 'integer':
    case 'rating':
      return '<input type="number"' + common + range + (def.type === 'integer' ? ' step="1"' : '') + ' />'
    case 'decimal':
    case 'percent':
      return '<input type="number" step="any"' + common + range + ' />'
    case 'email':
      return '<input type="email"' + common + length + ' />'
    case 'url':
      return '<input type="url"' + common + length + ' />'
    case 'phone':
      return '<input type="tel"' + common + length + ' />'
    case 'date':
      return '<input type="date"' + common + ' />'
    case 'datetime':
      return '<input type="datetime-local"' + common + ' />'
    case 'color':
      return '<input type="color"' + common + ' />'
    default:
      return '<input type="text"' + common + length + ' />'
  }
}

export function honeypotHtml(field: string | null): string {
  if (!field) return ''
  return (
    '<p class="cr-hp" aria-hidden="true" style="position:absolute;left:-9999px;top:auto;width:1px;height:1px;overflow:hidden">' +
    '<label>' + esc(strings.honeypot) + ' <input type="text" name="' + esc(field) + '" tabindex="-1" autocomplete="off" /></label></p>'
  )
}

export function captchaHtml(captcha: 'turnstile' | null, siteKey: string | null): string {
  if (captcha !== 'turnstile' || !siteKey) return ''
  return '<div class="cf-turnstile" data-sitekey="' + esc(siteKey) + '"></div>'
}

export function errorsHtml(errors: FieldError[]): string {
  return (
    '<ul class="cr-errors" role="alert">' +
    errors.map((e) => '<li data-field="' + esc(e.field) + '">' + esc(e.field) + ': ' + esc(e.message) + '</li>').join('') +
    '</ul>'
  )
}

/** The whole form for a public form config: one control per exposed field, honeypot, captcha, submit. */
export function formHtml(config: FormConfig, prefix = 'cr-field'): string {
  const fields = Object.entries(config.fields)
    .map(([id, def]) => {
      const control = fieldControl(id, def, prefix)
      const label = '<label for="' + esc(prefix + '-' + id) + '">' + esc(labelFor(id, def)) + (def.required ? ' <span aria-hidden="true">*</span>' : '') + '</label>'
      return '<p class="cr-field cr-field--' + esc(def.type) + '">' + (def.type === 'boolean' ? control + ' ' + label : label + control) + '</p>'
    })
    .join('')
  return (
    '<form class="cr-form" method="post" data-model="' + esc(config.modelId) + '">' +
    fields +
    honeypotHtml(config.honeypotField) +
    captchaHtml(config.captcha, config.captchaSiteKey) +
    '<p class="cr-actions"><button type="submit">' + esc(strings.send) + '</button></p>' +
    '<div class="cr-status" aria-live="polite"></div>' +
    '</form>'
  )
}

// ─── Comments ───

export interface CommentAuthor {
  name: string
  url: string | null
  isModerator: boolean
}

export interface PublicComment {
  id: string
  parentId: string | null
  depth: number
  author: CommentAuthor
  /** Plain text. */
  body: string
  type: 'comment' | 'pingback' | 'trackback'
  createdAt: string
  replies: PublicComment[]
}

export interface ThreadConfig {
  closed: boolean
  requireApproval: boolean
  requireEmail: boolean
  maxDepth: number
  maxBodyLength: number
  captcha: 'turnstile' | null
  captchaSiteKey: string | null
  honeypotField: string | null
}

export interface CommentThread {
  entry: { modelId: string; entryId: string; locale: string }
  config: ThreadConfig
  comments: PublicComment[]
  total: number
  page: number
  limit: number
}

export interface CommentSubmitBody {
  author: { name: string; email?: string; url?: string }
  body: string
  /** null for a root comment — sent explicitly, as the provider's own fixture does. */
  parentId: string | null
  captchaToken?: string
  _hp?: string
}

export interface CommentSubmitResult {
  success: boolean
  status?: 'pending' | 'approved'
  comment?: PublicComment
  errors?: FieldError[]
}

export interface ThreadQuery {
  page?: number
  limit?: number
  sort?: 'oldest' | 'newest'
}

export function fetchThread(rt: Runtime, entry: EntryRef, query?: ThreadQuery): Promise<CommentThread> {
  const url = publicUrl(commentsRoot(rt), [rt.project_id, entry.model_id, entry.entry_id], {
    locale: entry.locale,
    page: query?.page,
    limit: query?.limit,
    sort: query?.sort,
  })
  return getJson<CommentThread>(url)
}

export function submitComment(rt: Runtime, entry: EntryRef, body: CommentSubmitBody): Promise<CommentSubmitResult> {
  const url = publicUrl(commentsRoot(rt), [rt.project_id, entry.model_id, entry.entry_id], { locale: entry.locale })
  return postJson<CommentSubmitResult>(url, body)
}

/** Comment-form entries → the documented request body (inputs: author_name, author_email, author_url, body, parent_id). */
export function commentPayload(entries: Iterable<[string, unknown]>, honeypotField: string | null): CommentSubmitBody {
  const values: Record<string, string> = {}
  const payload: CommentSubmitBody = { author: { name: '' }, body: '', parentId: null }
  for (const [name, raw] of entries) {
    if (typeof raw !== 'string') continue
    if (name === CAPTCHA_FIELD) {
      if (raw) payload.captchaToken = raw
      continue
    }
    if (honeypotField && name === honeypotField) {
      payload._hp = raw
      continue
    }
    values[name] = raw
  }
  payload.author.name = (values.author_name ?? '').trim()
  if (values.author_email?.trim()) payload.author.email = values.author_email.trim()
  if (values.author_url?.trim()) payload.author.url = values.author_url.trim()
  payload.body = (values.body ?? '').trim()
  payload.parentId = values.parent_id?.trim() || null
  return payload
}

/** Plain text → paragraphs; blank lines separate paragraphs, single newlines break lines. */
export function bodyHtml(text: string): string {
  return text
    .split(/\\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => '<p>' + esc(p).replace(/\\n/g, '<br />') + '</p>')
    .join('')
}

export function hasMore(thread: CommentThread): boolean {
  return thread.page * thread.limit < thread.total
}

/** One comment with its replies. A reply button appears only while the thread is open and depth allows it. */
export function commentHtml(c: PublicComment, config: { closed: boolean; maxDepth: number }): string {
  const author = c.author.url
    ? '<a href="' + esc(c.author.url) + '" rel="nofollow ugc noopener" target="_blank">' + esc(c.author.name) + '</a>'
    : esc(c.author.name)
  const badge = c.author.isModerator ? ' <span class="cr-moderator">' + esc(strings.moderator) + '</span>' : ''
  const date = '<time datetime="' + esc(c.createdAt) + '">' + esc(c.createdAt.slice(0, 10)) + '</time>'
  const canReply = !config.closed && c.depth < config.maxDepth
  const reply = canReply
    ? '<button type="button" class="cr-reply" data-parent="' + esc(c.id) + '" data-author="' + esc(c.author.name) + '">' + esc(strings.reply) + '</button>'
    : ''
  const replies = c.replies.length
    ? '<ol class="cr-replies">' + c.replies.map((r) => commentHtml(r, config)).join('') + '</ol>'
    : ''
  return (
    '<li class="cr-comment cr-comment--' + esc(c.type) + '" id="cr-comment-' + esc(c.id) + '" data-depth="' + esc(c.depth) + '">' +
    '<div class="cr-comment-meta"><span class="cr-comment-author">' + author + '</span>' + badge + ' ' + date + '</div>' +
    '<div class="cr-comment-body">' + bodyHtml(c.body) + '</div>' +
    (reply ? '<div class="cr-comment-actions">' + reply + '</div>' : '') +
    replies +
    '</li>'
  )
}

export function threadHtml(thread: CommentThread): string {
  if (!thread.comments.length) return '<p class="cr-empty">' + esc(strings.noComments) + '</p>'
  return '<ol class="cr-comment-list">' + thread.comments.map((c) => commentHtml(c, thread.config)).join('') + '</ol>'
}

/** The comment form; a reply carries its parent in a hidden input. */
export function commentFormHtml(config: ThreadConfig, prefix = 'cr-c'): string {
  const emailLabel = esc(strings.email) + (config.requireEmail ? ' <span aria-hidden="true">*</span>' : '') + ' <small>' + esc(strings.emailNote) + '</small>'
  return (
    '<form class="cr-comment-form" method="post">' +
    '<input type="hidden" name="parent_id" value="" />' +
    '<p class="cr-replying" hidden><span class="cr-replying-to"></span> <button type="button" class="cr-cancel-reply">' + esc(strings.cancel) + '</button></p>' +
    '<p class="cr-field"><label for="' + prefix + '-body">' + esc(strings.comment) + ' <span aria-hidden="true">*</span></label>' +
    '<textarea id="' + prefix + '-body" name="body" required maxlength="' + esc(config.maxBodyLength) + '" rows="5"></textarea></p>' +
    '<p class="cr-field"><label for="' + prefix + '-name">' + esc(strings.name) + ' <span aria-hidden="true">*</span></label>' +
    '<input type="text" id="' + prefix + '-name" name="author_name" required maxlength="120" autocomplete="name" /></p>' +
    '<p class="cr-field"><label for="' + prefix + '-email">' + emailLabel + '</label>' +
    '<input type="email" id="' + prefix + '-email" name="author_email"' + (config.requireEmail ? ' required' : '') + ' maxlength="254" autocomplete="email" /></p>' +
    '<p class="cr-field"><label for="' + prefix + '-url">' + esc(strings.website) + '</label>' +
    '<input type="url" id="' + prefix + '-url" name="author_url" maxlength="2048" autocomplete="url" /></p>' +
    honeypotHtml(config.honeypotField) +
    captchaHtml(config.captcha, config.captchaSiteKey) +
    '<p class="cr-actions"><button type="submit">' + esc(strings.postComment) + '</button></p>' +
    '<div class="cr-status" aria-live="polite"></div>' +
    '</form>'
  )
}

// ─── Turnstile (explicit render, so widgets added after load still render) ───

interface TurnstileApi {
  render: (el: Element, options: { sitekey: string }) => string
  reset: (id?: string) => void
}

const TURNSTILE_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=__crTurnstileReady'
const widgets = new WeakMap<Element, string>()
const waiting: Element[] = []

function turnstileApi(): TurnstileApi | undefined {
  return (globalThis as { turnstile?: TurnstileApi }).turnstile
}

function renderWidget(api: TurnstileApi, el: Element): void {
  if (widgets.has(el)) return
  widgets.set(el, api.render(el, { sitekey: el.getAttribute('data-sitekey') ?? '' }))
}

/** Render every \`.cf-turnstile\` under \`root\`, loading the Turnstile script once on first use. */
export function renderCaptcha(root: ParentNode): void {
  const els = Array.from(root.querySelectorAll('.cf-turnstile'))
  if (!els.length) return
  const api = turnstileApi()
  if (api) {
    for (const el of els) renderWidget(api, el)
    return
  }
  waiting.push(...els)
  if (document.querySelector('script[data-cr-turnstile]')) return
  ;(globalThis as Record<string, unknown>).__crTurnstileReady = () => {
    const ready = turnstileApi()
    if (!ready) return
    for (const el of waiting.splice(0)) renderWidget(ready, el)
  }
  const script = document.createElement('script')
  script.src = TURNSTILE_SRC
  script.async = true
  script.defer = true
  script.setAttribute('data-cr-turnstile', '1')
  document.head.appendChild(script)
}

export function resetCaptcha(root: ParentNode): void {
  const api = turnstileApi()
  if (!api) return
  for (const el of Array.from(root.querySelectorAll('.cf-turnstile'))) api.reset(widgets.get(el))
}

// ─── Mounting (the only DOM code) ───

export function runtimeOf(host: HTMLElement): Runtime {
  return { base_url: host.dataset.baseUrl ?? '', project_id: host.dataset.project ?? '' }
}

function entryOf(host: HTMLElement): EntryRef {
  return { model_id: host.dataset.model ?? '', entry_id: host.dataset.entry ?? '', locale: host.dataset.locale || undefined }
}

function setStatus(form: HTMLFormElement, html: string): void {
  const status = form.querySelector('.cr-status')
  if (status) status.innerHTML = html
}

function busy(form: HTMLFormElement, on: boolean): void {
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')
  if (!button) return
  button.disabled = on
  if (on) {
    button.dataset.label = button.textContent ?? ''
    button.textContent = strings.sending
  } else {
    button.textContent = button.dataset.label ?? button.textContent
  }
}

function entriesOf(form: HTMLFormElement): Array<[string, unknown]> {
  const out: Array<[string, unknown]> = []
  new FormData(form).forEach((value, key) => out.push([key, value]))
  return out
}

/** \`<cr-form data-base-url data-project data-model>\` → fetch the config, render, submit. */
export async function mountForm(host: HTMLElement): Promise<void> {
  const rt = runtimeOf(host)
  const model = host.dataset.model ?? ''
  host.innerHTML = '<p class="cr-loading">' + esc(strings.loading) + '</p>'
  let config: FormConfig
  try {
    config = await fetchFormConfig(rt, model)
  } catch (error) {
    host.innerHTML = '<p class="cr-error">' + esc(error instanceof Error ? error.message : strings.failed) + '</p>'
    return
  }
  host.innerHTML = formHtml(config)
  renderCaptcha(host)
  const form = host.querySelector('form')
  if (!form) return
  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    busy(form, true)
    setStatus(form, '')
    try {
      const result = await submitForm(rt, model, formPayload(entriesOf(form), config))
      if (result.success) {
        host.innerHTML = '<p class="cr-success" role="status">' + esc(result.message ?? config.successMessage ?? '') + '</p>'
        return
      }
      setStatus(form, errorsHtml(result.errors ?? []))
      resetCaptcha(form)
    } catch (error) {
      setStatus(form, '<p class="cr-error" role="alert">' + esc(error instanceof Error ? error.message : strings.failed) + '</p>')
      resetCaptcha(form)
    } finally {
      busy(form, false)
    }
  })
}

/** \`<cr-comments data-base-url data-project data-model data-entry data-locale>\` → thread + form. */
export async function mountComments(host: HTMLElement): Promise<void> {
  const rt = runtimeOf(host)
  const entry = entryOf(host)
  host.innerHTML = '<p class="cr-loading">' + esc(strings.loading) + '</p>'
  let thread: CommentThread
  try {
    thread = await fetchThread(rt, entry)
  } catch (error) {
    host.innerHTML = '<p class="cr-error">' + esc(error instanceof Error ? error.message : strings.failed) + '</p>'
    return
  }

  host.innerHTML =
    '<section class="cr-comments-section">' +
    '<h2 class="cr-comments-title">' + esc(strings.commentsTitle) + ' <span class="cr-count">(' + esc(thread.total) + ')</span></h2>' +
    '<div class="cr-thread">' + threadHtml(thread) + '</div>' +
    (hasMore(thread) ? '<p class="cr-more"><button type="button" class="cr-load-more">' + esc(strings.loadMore) + '</button></p>' : '') +
    (thread.config.closed ? '<p class="cr-closed">' + esc(strings.closed) + '</p>' : commentFormHtml(thread.config)) +
    '</section>'
  renderCaptcha(host)

  const threadEl = host.querySelector('.cr-thread')
  const form = host.querySelector<HTMLFormElement>('form.cr-comment-form')
  let page = thread.page

  host.addEventListener('click', async (event) => {
    const target = event.target as HTMLElement | null
    if (!target) return
    const replyButton = target.closest<HTMLElement>('.cr-reply')
    if (replyButton && form) {
      const parent = form.querySelector<HTMLInputElement>('input[name="parent_id"]')
      if (parent) parent.value = replyButton.dataset.parent ?? ''
      const replying = form.querySelector<HTMLElement>('.cr-replying')
      const to = form.querySelector('.cr-replying-to')
      if (to) to.textContent = strings.replyingTo + ' ' + (replyButton.dataset.author ?? '')
      if (replying) replying.hidden = false
      replyButton.closest('.cr-comment')?.appendChild(form)
      form.querySelector<HTMLTextAreaElement>('textarea[name="body"]')?.focus()
      return
    }
    if (target.closest('.cr-cancel-reply') && form) {
      const parent = form.querySelector<HTMLInputElement>('input[name="parent_id"]')
      if (parent) parent.value = ''
      const replying = form.querySelector<HTMLElement>('.cr-replying')
      if (replying) replying.hidden = true
      host.querySelector('.cr-comments-section')?.appendChild(form)
      return
    }
    const more = target.closest<HTMLButtonElement>('.cr-load-more')
    if (more && threadEl) {
      more.disabled = true
      try {
        const next = await fetchThread(rt, entry, { page: page + 1 })
        page = next.page
        const list = threadEl.querySelector('.cr-comment-list')
        if (list) list.insertAdjacentHTML('beforeend', next.comments.map((c) => commentHtml(c, next.config)).join(''))
        if (!hasMore(next)) more.closest('.cr-more')?.remove()
      } finally {
        more.disabled = false
      }
    }
  })

  form?.addEventListener('submit', async (event) => {
    event.preventDefault()
    busy(form, true)
    setStatus(form, '')
    try {
      const result = await submitComment(rt, entry, commentPayload(entriesOf(form), thread.config.honeypotField))
      if (!result.success) {
        setStatus(form, errorsHtml(result.errors ?? []))
        resetCaptcha(form)
        return
      }
      const parentId = result.comment?.parentId ?? null
      if (result.status === 'approved' && result.comment && threadEl) {
        const html = commentHtml(result.comment, thread.config)
        const parent = parentId ? threadEl.querySelector('#cr-comment-' + parentId) : null
        if (parent) {
          let replies = parent.querySelector(':scope > .cr-replies')
          if (!replies) {
            parent.insertAdjacentHTML('beforeend', '<ol class="cr-replies"></ol>')
            replies = parent.querySelector(':scope > .cr-replies')
          }
          replies?.insertAdjacentHTML('beforeend', html)
        } else {
          const list = threadEl.querySelector('.cr-comment-list')
          if (list) list.insertAdjacentHTML('beforeend', html)
          else threadEl.innerHTML = '<ol class="cr-comment-list">' + html + '</ol>'
        }
      }
      form.reset()
      host.querySelector('.cr-comments-section')?.appendChild(form)
      const replying = form.querySelector<HTMLElement>('.cr-replying')
      if (replying) replying.hidden = true
      resetCaptcha(form)
      setStatus(form, '<p class="cr-success" role="status">' + esc(result.status === 'approved' ? strings.posted : strings.pending) + '</p>')
    } catch (error) {
      setStatus(form, '<p class="cr-error" role="alert">' + esc(error instanceof Error ? error.message : strings.failed) + '</p>')
      resetCaptcha(form)
    } finally {
      busy(form, false)
    }
  })
}
`

// Public comments client — the browser side of Studio's `/api/comments/v1`.
//
// Contract (Studio docs/COMMENTS.md):
//   GET  {base}/{projectId}/{modelId}/{entryId}?locale&page&limit&sort → CommentThread
//   POST {base}/{projectId}/{modelId}/{entryId}?locale
//        { author: { name, email?, url? }, body, parentId?, captchaToken?, _hp? } → CommentSubmitResult
//
// Only approved comments come back, nested under their roots; email, IP,
// user agent and referrer never leave the server. `body` is plain text —
// render it escaped. No credential is sent: the endpoints are public.

import { publicGet, publicPost, publicUrl } from './public-request.js'

export type CommentType = 'comment' | 'pingback' | 'trackback'

export interface CommentAuthor {
  name: string
  url: string | null
  /** Written from Studio by a workspace member. */
  isModerator: boolean
}

export interface PublicComment {
  id: string
  parentId: string | null
  depth: number
  author: CommentAuthor
  /** Plain text. */
  body: string
  type: CommentType
  /** ISO 8601. */
  createdAt: string
  replies: PublicComment[]
}

export interface CommentThreadConfig {
  /** Thread closed → render the comments, hide the form. */
  closed: boolean
  requireApproval: boolean
  requireEmail: boolean
  /** Reply nesting cap for new submissions (0 = flat). */
  maxDepth: number
  maxBodyLength: number
  captcha: 'turnstile' | null
  captchaSiteKey: string | null
  honeypotField: string | null
}

export interface CommentThread {
  entry: { modelId: string; entryId: string; locale: string }
  config: CommentThreadConfig
  /** Root comments of this page, replies nested. */
  comments: PublicComment[]
  /** Root comments in total. */
  total: number
  page: number
  limit: number
}

export interface CommentThreadQuery {
  locale?: string
  page?: number
  limit?: number
  sort?: 'oldest' | 'newest'
}

export interface CommentSubmission {
  author: { name: string; email?: string; url?: string }
  body: string
  /** Reply target — an approved comment's id. */
  parentId?: string
  captchaToken?: string
  /** Value of the honeypot input (`config.honeypotField`); a human leaves it empty. */
  honeypot?: string
}

export interface CommentFieldError {
  /** `author.name` · `author.email` · `author.url` · `body` · `parentId` · `captcha` */
  field: string
  message: string
}

export interface CommentSubmitResult {
  success: boolean
  /** `approved` renders now; `pending` is only echoed back to its author. */
  status?: 'pending' | 'approved'
  /** The stored comment, in the public shape. Absent when the honeypot swallowed the post. */
  comment?: PublicComment
  errors?: CommentFieldError[]
}

export interface CommentsClientConfig {
  /** Public API root — `https://studio.contentrain.io/api/comments/v1`. */
  baseUrl: string
  projectId: string
}

export class CommentsClient {
  private _baseUrl: string
  private _projectId: string

  constructor(config: CommentsClientConfig) {
    this._baseUrl = config.baseUrl.replace(/\/+$/, '')
    this._projectId = config.projectId
  }

  thread(modelId: string, entryId: string, query?: CommentThreadQuery): Promise<CommentThread> {
    const url = publicUrl(this._baseUrl, [this._projectId, modelId, entryId], {
      locale: query?.locale,
      page: query?.page,
      limit: query?.limit,
      sort: query?.sort,
    })
    return publicGet<CommentThread>(url)
  }

  /**
   * Resolves with the server's verdict for 2xx responses — including
   * `{ success: false, errors }`. Rejects with `ContentrainError` on
   * 403 (thread closed / plan), 404, 429 and 5xx.
   */
  submit(
    modelId: string,
    entryId: string,
    submission: CommentSubmission,
    options?: { locale?: string },
  ): Promise<CommentSubmitResult> {
    const url = publicUrl(this._baseUrl, [this._projectId, modelId, entryId], { locale: options?.locale })
    const body: Record<string, unknown> = { author: submission.author, body: submission.body }
    if (submission.parentId) body.parentId = submission.parentId
    if (submission.captchaToken) body.captchaToken = submission.captchaToken
    if (submission.honeypot !== undefined) body._hp = submission.honeypot
    return publicPost<CommentSubmitResult>(url, body)
  }
}

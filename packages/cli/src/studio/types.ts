// ---------------------------------------------------------------------------
// Studio API types — used by CLI commands that connect to Contentrain Studio
// ---------------------------------------------------------------------------

/** Persisted in ~/.contentrain/credentials.json (never in project directory). */
export interface StudioCredentials {
  /** Studio instance base URL (e.g. https://studio.contentrain.io) */
  studioUrl: string
  /** OAuth access token */
  accessToken: string
  /** OAuth refresh token */
  refreshToken: string
  /** ISO 8601 expiry timestamp */
  expiresAt: string
  /** Remembered workspace (saves interactive prompts) */
  defaultWorkspaceId?: string
  /** Remembered project (saves interactive prompts) */
  defaultProjectId?: string
}

/** Envelope written to ~/.contentrain/credentials.json. */
export interface StudioConfig {
  version: 1
  credentials: StudioCredentials
}

// ── Auth ──────────────────────────────────────────────────────────────────

export interface UserProfile {
  id: string
  email: string
  name: string | null
  avatarUrl: string | null
  provider: string
}

// ── Workspace / Project ───────────────────────────────────────────────────

export interface Workspace {
  id: string
  name: string
  slug: string
  plan: string
  role: string
}

export interface Project {
  id: string
  name: string
  slug: string
  stack: string
  repositoryUrl: string | null
  memberCount: number
}

// ── GitHub Integration ───────────────────────────────────────────────────

export interface GitHubInstallation {
  id: number
  accountLogin: string
  accountType: 'User' | 'Organization'
  avatarUrl: string | null
  appSlug: string
}

export interface GitHubRepo {
  id: number
  fullName: string
  private: boolean
  defaultBranch: string
  htmlUrl: string
}

export interface ScanResult {
  hasContentrain: boolean
  models: string[]
  locales: string[]
  configPath: string | null
}

export interface CreateProjectPayload {
  name: string
  installationId: number
  repositoryFullName: string
  defaultBranch: string
}

export interface GitHubSetupUrl {
  url: string
}

// ── Branches ──────────────────────────────────────────────────────────────

export interface Branch {
  name: string
  /** Number of commits ahead of base branch */
  ahead: number
  lastCommitDate: string
  author: string | null
}

// ── CDN ───────────────────────────────────────────────────────────────────

export interface CdnKey {
  id: string
  name: string
  /** Only returned once — at creation time */
  key?: string
  prefix: string
  createdAt: string
  rateLimit: number | null
}

export interface CdnBuild {
  id: string
  status: 'building' | 'success' | 'failed'
  fileCount: number
  totalSizeBytes: number
  buildDurationMs: number | null
  changedModels: string[]
  errorMessage: string | null
  createdAt: string
}

export interface CdnSettings {
  enabled: boolean
  customDomain: string | null
}

// ── Webhooks ──────────────────────────────────────────────────────────────

export type WebhookEvent =
  | 'content.saved'
  | 'content.deleted'
  | 'model.saved'
  | 'branch.merged'
  | 'branch.rejected'
  | 'cdn.build_complete'
  | 'media.uploaded'
  | 'form.submitted'

export interface Webhook {
  id: string
  name: string
  url: string
  events: WebhookEvent[]
  active: boolean
  createdAt: string
}

export interface WebhookConfig {
  name: string
  url: string
  events: WebhookEvent[]
}

export interface WebhookDelivery {
  id: string
  event: WebhookEvent
  status: 'pending' | 'success' | 'failed'
  httpStatus: number | null
  createdAt: string
}

export interface WebhookTestResult {
  success: boolean
  httpStatus: number | null
  responseBody: string | null
}

// ── Forms / Submissions ───────────────────────────────────────────────────

export interface Submission {
  id: string
  modelId: string
  status: 'pending' | 'approved' | 'rejected' | 'spam'
  data: Record<string, unknown>
  submittedAt: string
  ip: string | null
}

// ── Activity ──────────────────────────────────────────────────────────────

export interface ActivityEntry {
  id: string
  action: string
  actor: string
  details: string | null
  createdAt: string
}

// ── Usage ─────────────────────────────────────────────────────────────────

export interface UsageMetric {
  current: number
  limit: number
  percentage: number
}

export interface UsageMetrics {
  aiMessages: UsageMetric
  formSubmissions: UsageMetric
  cdnBandwidthGb: UsageMetric
  mediaStorageGb: UsageMetric
}

// ── API Errors ────────────────────────────────────────────────────────────

export class StudioApiError extends Error {
  constructor(
    public statusCode: number,
    public statusText: string,
    message: string,
  ) {
    super(message)
    this.name = 'StudioApiError'
  }
}

export class AuthExpiredError extends StudioApiError {
  constructor() {
    super(401, 'Unauthorized', 'Session expired. Run `contentrain studio login` to re-authenticate.')
    this.name = 'AuthExpiredError'
  }
}

// ── Paginated response envelope ───────────────────────────────────────────

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  limit: number
}

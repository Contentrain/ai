// ---------------------------------------------------------------------------
// Studio API client — thin wrapper around native fetch.
//
// Features:
//   - Automatic token refresh before expired requests
//   - Typed error classes (StudioApiError, AuthExpiredError)
//   - Consistent JSON request/response handling
// ---------------------------------------------------------------------------

import { loadCredentials, saveCredentials, isTokenExpired } from './auth/credential-store.js'
import {
  StudioApiError,
  AuthExpiredError,
  type StudioCredentials,
  type UserProfile,
  type Workspace,
  type Project,
  type Branch,
  type CdnKey,
  type CdnBuild,
  type CdnSettings,
  type Webhook,
  type WebhookConfig,
  type WebhookDelivery,
  type WebhookTestResult,
  type Submission,
  type ActivityEntry,
  type UsageMetrics,
  type PaginatedResponse,
} from './types.js'

// ── Client ────────────────────────────────────────────────────────────────

export class StudioApiClient {
  private baseUrl: string
  private credentials: StudioCredentials

  constructor(credentials: StudioCredentials) {
    this.baseUrl = credentials.studioUrl.replace(/\/+$/, '')
    this.credentials = credentials
  }

  // ── Core HTTP ─────────────────────────────────────────────────────────

  private async request<T>(
    method: string,
    path: string,
    options?: { body?: unknown; query?: Record<string, string> },
  ): Promise<T> {
    // Auto-refresh expired tokens (skip for the refresh call itself)
    if (isTokenExpired(this.credentials) && this.credentials.refreshToken) {
      await this.refreshToken()
    }

    const url = new URL(`${this.baseUrl}${path}`)
    if (options?.query) {
      for (const [key, value] of Object.entries(options.query)) {
        url.searchParams.set(key, value)
      }
    }

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.credentials.accessToken}`,
      'Accept': 'application/json',
    }

    if (options?.body !== undefined) {
      headers['Content-Type'] = 'application/json'
    }

    const res = await globalThis.fetch(url.toString(), {
      method,
      headers,
      body: options?.body !== undefined ? JSON.stringify(options.body) : undefined,
    })

    if (res.status === 401) {
      // One retry after token refresh
      if (this.credentials.refreshToken) {
        try {
          await this.refreshToken()

          const retryHeaders = { ...headers, 'Authorization': `Bearer ${this.credentials.accessToken}` }
          const retry = await globalThis.fetch(url.toString(), {
            method,
            headers: retryHeaders,
            body: options?.body !== undefined ? JSON.stringify(options.body) : undefined,
          })

          if (retry.ok) {
            return retry.status === 204 ? (undefined as T) : await retry.json() as T
          }
        } catch {
          // Refresh failed — fall through to AuthExpiredError
        }
      }
      throw new AuthExpiredError()
    }

    if (!res.ok) {
      let message: string
      try {
        const body = await res.json() as { message?: string }
        message = body.message ?? res.statusText
      } catch {
        message = res.statusText
      }
      throw new StudioApiError(res.status, res.statusText, message)
    }

    if (res.status === 204) return undefined as T
    return await res.json() as T
  }

  private async refreshToken(): Promise<void> {
    const res = await globalThis.fetch(`${this.baseUrl}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: this.credentials.refreshToken }),
    })

    if (!res.ok) {
      throw new AuthExpiredError()
    }

    const data = await res.json() as {
      accessToken: string
      refreshToken: string
      expiresAt: string
    }

    this.credentials.accessToken = data.accessToken
    this.credentials.refreshToken = data.refreshToken
    this.credentials.expiresAt = data.expiresAt

    // Persist refreshed tokens
    await saveCredentials(this.credentials)
  }

  // ── Auth ──────────────────────────────────────────────────────────────

  async me(): Promise<UserProfile> {
    return this.request<UserProfile>('GET', '/api/auth/me')
  }

  async logout(): Promise<void> {
    await this.request<void>('POST', '/api/auth/logout')
  }

  // ── Workspaces ────────────────────────────────────────────────────────

  async listWorkspaces(): Promise<Workspace[]> {
    return this.request<Workspace[]>('GET', '/api/workspaces')
  }

  async getWorkspaceUsage(workspaceId: string): Promise<UsageMetrics> {
    return this.request<UsageMetrics>('GET', `/api/workspaces/${workspaceId}/usage`)
  }

  // ── Projects ──────────────────────────────────────────────────────────

  async listProjects(workspaceId: string): Promise<Project[]> {
    return this.request<Project[]>('GET', `/api/workspaces/${workspaceId}/projects`)
  }

  // ── Branches ──────────────────────────────────────────────────────────

  async listBranches(wid: string, pid: string): Promise<Branch[]> {
    return this.request<Branch[]>('GET', `/api/workspaces/${wid}/projects/${pid}/branches`)
  }

  async mergeBranch(wid: string, pid: string, branch: string): Promise<void> {
    await this.request<void>('POST', `/api/workspaces/${wid}/projects/${pid}/branches/${encodeURIComponent(branch)}/merge`)
  }

  async rejectBranch(wid: string, pid: string, branch: string): Promise<void> {
    await this.request<void>('POST', `/api/workspaces/${wid}/projects/${pid}/branches/${encodeURIComponent(branch)}/reject`)
  }

  // ── CDN ───────────────────────────────────────────────────────────────

  async listCdnKeys(wid: string, pid: string): Promise<CdnKey[]> {
    return this.request<CdnKey[]>('GET', `/api/workspaces/${wid}/projects/${pid}/cdn/keys`)
  }

  async createCdnKey(wid: string, pid: string, name: string): Promise<CdnKey> {
    return this.request<CdnKey>('POST', `/api/workspaces/${wid}/projects/${pid}/cdn/keys`, {
      body: { name },
    })
  }

  async getCdnSettings(wid: string, pid: string): Promise<CdnSettings> {
    return this.request<CdnSettings>('GET', `/api/workspaces/${wid}/projects/${pid}/cdn/settings`)
  }

  async triggerCdnBuild(wid: string, pid: string): Promise<CdnBuild> {
    return this.request<CdnBuild>('POST', `/api/workspaces/${wid}/projects/${pid}/cdn/builds/trigger`)
  }

  async listCdnBuilds(wid: string, pid: string, query?: { page?: string; limit?: string }): Promise<PaginatedResponse<CdnBuild>> {
    return this.request<PaginatedResponse<CdnBuild>>('GET', `/api/workspaces/${wid}/projects/${pid}/cdn/builds`, { query })
  }

  // ── Webhooks ──────────────────────────────────────────────────────────

  async listWebhooks(wid: string, pid: string): Promise<Webhook[]> {
    return this.request<Webhook[]>('GET', `/api/workspaces/${wid}/projects/${pid}/webhooks`)
  }

  async createWebhook(wid: string, pid: string, config: WebhookConfig): Promise<Webhook> {
    return this.request<Webhook>('POST', `/api/workspaces/${wid}/projects/${pid}/webhooks`, {
      body: config,
    })
  }

  async deleteWebhook(wid: string, pid: string, webhookId: string): Promise<void> {
    await this.request<void>('DELETE', `/api/workspaces/${wid}/projects/${pid}/webhooks/${webhookId}`)
  }

  async testWebhook(wid: string, pid: string, webhookId: string): Promise<WebhookTestResult> {
    return this.request<WebhookTestResult>('POST', `/api/workspaces/${wid}/projects/${pid}/webhooks/${webhookId}/test`)
  }

  async listWebhookDeliveries(wid: string, pid: string, webhookId: string): Promise<PaginatedResponse<WebhookDelivery>> {
    return this.request<PaginatedResponse<WebhookDelivery>>('GET', `/api/workspaces/${wid}/projects/${pid}/webhooks/${webhookId}/deliveries`)
  }

  // ── Forms / Submissions ───────────────────────────────────────────────

  async listSubmissions(
    wid: string,
    pid: string,
    modelId: string,
    query?: { status?: string; page?: string; limit?: string },
  ): Promise<PaginatedResponse<Submission>> {
    return this.request<PaginatedResponse<Submission>>(
      'GET',
      `/api/workspaces/${wid}/projects/${pid}/forms/${modelId}/submissions`,
      { query },
    )
  }

  async updateSubmissionStatus(
    wid: string,
    pid: string,
    modelId: string,
    submissionId: string,
    status: 'approved' | 'rejected' | 'spam',
  ): Promise<void> {
    await this.request<void>(
      'PATCH',
      `/api/workspaces/${wid}/projects/${pid}/forms/${modelId}/submissions/${submissionId}`,
      { body: { status } },
    )
  }

  // ── Activity ──────────────────────────────────────────────────────────

  async getActivity(
    wid: string,
    pid: string,
    query?: { limit?: string },
  ): Promise<PaginatedResponse<ActivityEntry>> {
    return this.request<PaginatedResponse<ActivityEntry>>(
      'GET',
      `/api/workspaces/${wid}/projects/${pid}/activity`,
      { query },
    )
  }
}

// ── Resolve helper ────────────────────────────────────────────────────────

/**
 * Load credentials and return an authenticated StudioApiClient.
 * Throws if the user is not logged in.
 */
export async function resolveStudioClient(): Promise<StudioApiClient> {
  const credentials = await loadCredentials()
  if (!credentials) {
    throw new Error('Not logged in. Run `contentrain studio login` first.')
  }
  return new StudioApiClient(credentials)
}

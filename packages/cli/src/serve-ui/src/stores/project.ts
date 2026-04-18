import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { useApi } from '@/composables/useApi'

export interface ModelSummary {
  id: string
  kind: 'singleton' | 'collection' | 'document' | 'dictionary'
  domain: string
  i18n: boolean
  fields: number
}

export interface ProjectStatus {
  initialized: boolean
  config: {
    stack: string
    workflow: 'auto-merge' | 'review'
    locales: { default: string; supported: string[] }
    domains: string[]
  } | null
  models: ModelSummary[]
  context: {
    lastOperation: Record<string, unknown>
    stats: Record<string, unknown>
  } | null
  vocabulary_size: number
  branches?: {
    total: number
    merged: number
    unmerged: number
  }
  validation?: {
    errors: number
    warnings: number
    summary: string[]
  }
}

/** `/api/doctor` — structured project health report. */
export interface DoctorCheck {
  name: string
  pass: boolean
  detail: string
  severity?: 'error' | 'warning' | 'info'
}

export interface DoctorUsage {
  unusedKeys: Array<{ model: string, kind: string, key: string, locale: string }>
  duplicateValues: Array<{ model: string, locale: string, value: string, keys: string[] }>
  missingLocaleKeys: Array<{ model: string, key: string, missingIn: string }>
}

export interface DoctorReport {
  checks: DoctorCheck[]
  summary: { total: number, passed: number, failed: number, warnings: number }
  usage?: DoctorUsage
}

/** `/api/preview/merge?branch=cr/...` — side-effect-free merge preview. */
export interface MergePreview {
  branch: string
  base: string
  alreadyMerged: boolean
  canFastForward: boolean
  conflicts: string[] | null
  filesChanged: number
  stat: string
}

/** Latest file-watcher error — surfaced as a dismissible banner. */
export interface FileWatchError {
  message: string
  timestamp: string
}

/**
 * `/api/capabilities` — provider + transport + capability manifest +
 * branch health. Populated once on app mount and invalidated on
 * `config:changed` / `context:changed` / `branch:*` events.
 */
export interface Capabilities {
  version: number
  provider: {
    type: 'local' | 'github' | 'gitlab'
    repo: { provider: string, owner: string, name: string, default_branch: string } | null
  }
  transport: 'stdio' | 'http'
  capabilities: {
    localWorktree: boolean
    sourceRead: boolean
    sourceWrite: boolean
    pushRemote: boolean
    branchProtection: boolean
    pullRequestFallback: boolean
    astScan: boolean
  }
  contentBranch: string
  defaultBranch: string
  branchHealth: {
    total: number
    merged: number
    unmerged: number
    warning: boolean
    blocked: boolean
    message?: string
  } | null
}

export const useProjectStore = defineStore('project', () => {
  const status = ref<ProjectStatus | null>(null)
  const capabilities = ref<Capabilities | null>(null)
  const doctor = ref<DoctorReport | null>(null)
  const formatReference = ref<Record<string, unknown> | null>(null)
  const fileWatchError = ref<FileWatchError | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  const api = useApi()

  /** True when branch health is at warning threshold or blocked — the
   * app-level banner reads from this to decide whether to render. */
  const branchHealthAlarm = computed(() => {
    const h = capabilities.value?.branchHealth
    if (!h) return null
    if (h.blocked) return { level: 'blocked' as const, message: h.message ?? 'Branch limit reached' }
    if (h.warning) return { level: 'warning' as const, message: h.message ?? 'Many active cr/* branches' }
    return null
  })

  async function fetchStatus() {
    loading.value = true
    error.value = null
    try {
      status.value = await api.get<ProjectStatus>('/status')
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to fetch status'
    } finally {
      loading.value = false
    }
  }

  async function fetchCapabilities() {
    try {
      capabilities.value = await api.get<Capabilities>('/capabilities')
    } catch {
      // Best-effort — UI stays functional without the badge.
    }
  }

  /**
   * Fetch the structured doctor report. `usage` opts into the heavier
   * analysis (unused keys, duplicates, locale gaps). Silent on error —
   * the Doctor page surfaces its own empty state when `doctor.value`
   * is null so the global shell doesn't have to care.
   */
  async function fetchDoctor(opts: { usage?: boolean } = {}) {
    try {
      const query = opts.usage ? '?usage=true' : ''
      doctor.value = await api.get<DoctorReport>(`/doctor${query}`)
    } catch {
      doctor.value = null
    }
  }

  async function fetchFormatReference() {
    try {
      formatReference.value = await api.get<Record<string, unknown>>('/describe-format')
    } catch {
      formatReference.value = null
    }
  }

  async function fetchMergePreview(branch: string): Promise<MergePreview | null> {
    try {
      return await api.get<MergePreview>(`/preview/merge?branch=${encodeURIComponent(branch)}`)
    } catch {
      return null
    }
  }

  function setFileWatchError(message: string, timestamp: string) {
    fileWatchError.value = { message, timestamp }
  }

  function dismissFileWatchError() {
    fileWatchError.value = null
  }

  return {
    status,
    capabilities,
    doctor,
    formatReference,
    fileWatchError,
    loading,
    error,
    branchHealthAlarm,
    fetchStatus,
    fetchCapabilities,
    fetchDoctor,
    fetchFormatReference,
    fetchMergePreview,
    setFileWatchError,
    dismissFileWatchError,
  }
})

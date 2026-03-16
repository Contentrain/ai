import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useApi } from '@/composables/useApi'

export interface ContentListResult {
  kind: string
  data: Record<string, unknown>[] | Record<string, unknown> | Record<string, string>
  total?: number
  total_keys?: number
  locale: string
  offset?: number
  limit?: number
}

export interface ModelDescription {
  id: string
  name: string
  kind: string
  domain: string
  i18n: boolean
  description?: string
  fields?: Record<string, { type: string; required?: boolean; default?: unknown }>
  stats: { total_entries: number; locales: Record<string, number> }
  sample?: unknown
}

export interface ValidationResult {
  valid: boolean
  summary: { errors: number; warnings: number; notices: number; models_checked: number; entries_checked: number }
  issues: Array<{ severity: string; model?: string; locale?: string; entry?: string; field?: string; message: string }>
}

export interface BranchInfo {
  name: string
  current: boolean
}

export interface HistoryEntry {
  hash: string
  message: string
  type: string
  target: string
  author: string
  date: string
  relativeDate: string
}

export interface BranchDiff {
  branch: string
  base: string
  stat: string
  diff: string
}

export interface NormalizePlanField {
  type: string
  required?: boolean
}

export interface NormalizePlanModel {
  id: string
  kind: string
  domain: string
  i18n?: boolean
  fields: Record<string, NormalizePlanField>
}

export interface NormalizePlanExtraction {
  value: string
  file: string
  line: number
  model: string
  field: string
  locale?: string
}

export interface NormalizePlanPatch {
  file: string
  line: number
  old_value: string
  new_expression: string
}

export interface NormalizePlan {
  version: number
  status: string
  created_at: string
  agent: string
  scan_stats: {
    files_scanned: number
    raw_strings: number
    candidates_sent: number
    extracted: number
    skipped: number
  }
  models: NormalizePlanModel[]
  extractions: NormalizePlanExtraction[]
  patches: NormalizePlanPatch[]
}

// ─── Normalize types ───

export interface NormalizeResults {
  lastOperation: unknown
  pendingBranches: Array<{ name: string }>
}

export const useContentStore = defineStore('content', () => {
  const api = useApi()

  const contentList = ref<ContentListResult | null>(null)
  const modelDescription = ref<ModelDescription | null>(null)
  const validation = ref<ValidationResult | null>(null)
  const branches = ref<BranchInfo[]>([])
  const branchDiff = ref<BranchDiff | null>(null)
  const loading = ref(false)

  // Normalize state
  const normalizeResults = ref<NormalizeResults | null>(null)

  async function fetchContent(modelId: string, locale?: string, limit?: number, offset?: number) {
    loading.value = true
    try {
      const params = new URLSearchParams()
      if (locale) params.set('locale', locale)
      if (limit !== undefined) params.set('limit', String(limit))
      if (offset !== undefined) params.set('offset', String(offset))
      const qs = params.toString()
      contentList.value = await api.get<ContentListResult>(`/content/${modelId}${qs ? `?${qs}` : ''}`)
    } finally {
      loading.value = false
    }
  }

  async function fetchModelDescription(modelId: string) {
    loading.value = true
    try {
      modelDescription.value = await api.get<ModelDescription>(`/describe/${modelId}`)
    } finally {
      loading.value = false
    }
  }

  async function fetchValidation(modelId?: string) {
    loading.value = true
    try {
      validation.value = await api.get<ValidationResult>(`/validate${modelId ? `?model=${modelId}` : ''}`)
    } finally {
      loading.value = false
    }
  }

  async function fetchValidationWithFix() {
    loading.value = true
    try {
      validation.value = await api.get<ValidationResult>('/validate?fix=true')
    } finally {
      loading.value = false
    }
  }

  async function fetchBranches() {
    loading.value = true
    try {
      const result = await api.get<{ branches: BranchInfo[] }>('/branches')
      branches.value = result.branches
    } finally {
      loading.value = false
    }
  }

  async function fetchBranchDiff(branchName: string) {
    loading.value = true
    try {
      branchDiff.value = await api.get<BranchDiff>(`/branches/diff?name=${encodeURIComponent(branchName)}`)
    } finally {
      loading.value = false
    }
  }

  // History
  const history = ref<HistoryEntry[]>([])

  async function fetchHistory(limit = 50) {
    loading.value = true
    try {
      const result = await api.get<{ entries: HistoryEntry[] }>(`/history?limit=${limit}`)
      history.value = result.entries
    } finally {
      loading.value = false
    }
  }

  async function approveBranch(branchName: string) {
    return api.post<{ status: string }>('/branches/approve', { branch: branchName })
  }

  async function rejectBranch(branchName: string) {
    return api.post<{ status: string }>('/branches/reject', { branch: branchName })
  }

  const normalizePlan = ref<NormalizePlan | null>(null)

  async function fetchNormalizePlan() {
    try {
      const result = await api.get<{ plan: NormalizePlan | null }>('/normalize/plan')
      normalizePlan.value = result.plan
    } catch {
      normalizePlan.value = null
    }
  }

  async function fetchNormalizeResults() {
    try {
      normalizeResults.value = await api.get<NormalizeResults>('/normalize/results')
    } catch {
      normalizeResults.value = null
    }
  }

  async function approvePlan(models?: string[]) {
    return api.post<unknown>('/normalize/plan/approve', models ? { models } : {})
  }

  async function rejectPlan() {
    return api.post<unknown>('/normalize/plan/reject', {})
  }

  return {
    contentList, modelDescription, validation, branches, branchDiff, history, normalizePlan, loading,
    normalizeResults,
    fetchContent, fetchModelDescription, fetchValidation, fetchValidationWithFix, fetchBranches, fetchBranchDiff, fetchHistory,
    approveBranch, rejectBranch, fetchNormalizePlan,
    fetchNormalizeResults, approvePlan, rejectPlan,
  }
})

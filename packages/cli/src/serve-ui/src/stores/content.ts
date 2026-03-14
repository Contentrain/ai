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

export interface BranchDiff {
  branch: string
  base: string
  stat: string
  diff: string
}

export const useContentStore = defineStore('content', () => {
  const api = useApi()

  const contentList = ref<ContentListResult | null>(null)
  const modelDescription = ref<ModelDescription | null>(null)
  const validation = ref<ValidationResult | null>(null)
  const branches = ref<BranchInfo[]>([])
  const branchDiff = ref<BranchDiff | null>(null)
  const loading = ref(false)

  async function fetchContent(modelId: string, locale?: string) {
    loading.value = true
    try {
      contentList.value = await api.get<ContentListResult>(`/content/${modelId}${locale ? `?locale=${locale}` : ''}`)
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

  async function approveBranch(branchName: string) {
    return api.post<{ status: string }>('/branches/approve', { branch: branchName })
  }

  async function rejectBranch(branchName: string) {
    return api.post<{ status: string }>('/branches/reject', { branch: branchName })
  }

  return {
    contentList, modelDescription, validation, branches, branchDiff, loading,
    fetchContent, fetchModelDescription, fetchValidation, fetchBranches, fetchBranchDiff,
    approveBranch, rejectBranch,
  }
})

import { defineStore } from 'pinia'
import { ref } from 'vue'
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

export const useProjectStore = defineStore('project', () => {
  const status = ref<ProjectStatus | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  const api = useApi()

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

  return { status, loading, error, fetchStatus }
})

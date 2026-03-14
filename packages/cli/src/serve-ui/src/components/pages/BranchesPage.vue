<script setup lang="ts">
import { onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useContentStore } from '@/stores/content'
import { useWatch } from '@/composables/useWatch'
import {
  GitBranch, RefreshCw, FileText, Database, Languages, ShieldCheck,
  ChevronRight, GitMerge, Clock,
} from 'lucide-vue-next'
import PageHeader from '@/components/layout/PageHeader.vue'
import StudioHint from '@/components/layout/StudioHint.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const store = useContentStore()
const router = useRouter()

const branches = computed(() => store.branches)

interface ParsedBranch {
  name: string
  scope: string
  target: string
  timestamp: string
  current: boolean
}

function parseBranch(branch: { name: string; current: boolean }): ParsedBranch {
  // contentrain/<scope>/<target>/<timestamp>
  const stripped = branch.name.replace('contentrain/', '')
  const parts = stripped.split('/')
  return {
    name: branch.name,
    scope: parts[0] ?? 'unknown',
    target: parts.length > 2 ? parts.slice(1, -1).join('/') : parts[1] ?? '',
    timestamp: parts.length > 2 ? parts[parts.length - 1] ?? '' : '',
    current: branch.current,
  }
}

const parsedBranches = computed(() => branches.value.map(parseBranch))

const scopeConfig: Record<string, { icon: typeof FileText; color: string; bg: string; label: string }> = {
  content: { icon: FileText, color: 'text-primary', bg: 'bg-primary/10', label: 'Content' },
  model: { icon: Database, color: 'text-status-info', bg: 'bg-status-info/10', label: 'Model' },
  normalize: { icon: Languages, color: 'text-status-warning', bg: 'bg-status-warning/10', label: 'Normalize' },
  validate: { icon: ShieldCheck, color: 'text-status-success', bg: 'bg-status-success/10', label: 'Validate' },
}

const defaultScopeConfig = { icon: GitBranch, color: 'text-muted-foreground', bg: 'bg-muted', label: 'Branch' }

function getScopeConfig(scope: string) {
  return scopeConfig[scope] ?? defaultScopeConfig
}

function formatTimestamp(ts: string): string {
  if (!ts) return ''
  // Try to parse as date-like: 20240314-1430 or similar
  const match = ts.match(/^(\d{4})(\d{2})(\d{2})-?(\d{2})(\d{2})/)
  if (match) {
    const [, y, m, d, h, min] = match
    const date = new Date(`${y}-${m}-${d}T${h}:${min}:00`)
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    }
  }
  return ts
}

onMounted(() => { store.fetchBranches() })

useWatch((event) => {
  if (event.type === 'branch:created' || event.type === 'branch:merged') store.fetchBranches()
})
</script>

<template>
  <div>
    <PageHeader title="Branches" :description="`${branches.length} pending contentrain branch${branches.length !== 1 ? 'es' : ''}`">
      <template #actions>
        <Button variant="outline" size="sm" :disabled="store.loading" @click="store.fetchBranches()">
          <RefreshCw class="mr-1.5 size-4" :class="store.loading && 'animate-spin'" /> Refresh
        </Button>
      </template>
    </PageHeader>

    <div class="px-6 py-6">
      <!-- Loading -->
      <div v-if="store.loading && branches.length === 0" class="flex justify-center py-12">
        <div class="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>

      <!-- Empty state -->
      <div v-else-if="branches.length === 0" class="flex flex-col items-center py-16 text-center">
        <img src="/merge-1.svg" alt="" class="empty-illustration mb-6" />
        <h2 class="text-lg font-semibold">No pending branches</h2>
        <p class="mt-2 max-w-sm text-sm text-muted-foreground">
          AI-generated content changes from your IDE will appear here for review.
          Branches are created automatically when agents save content or models.
        </p>
      </div>

      <!-- Branch list -->
      <div v-else class="space-y-2">
        <button
          v-for="branch in parsedBranches"
          :key="branch.name"
          class="group flex w-full items-center gap-4 rounded-xl border border-border bg-card p-4 text-left transition-all hover:border-primary/30 hover:shadow-sm"
          @click="router.push(`/branches/${encodeURIComponent(branch.name)}`)"
        >
          <!-- Scope icon -->
          <div :class="cn('flex size-10 items-center justify-center rounded-lg', getScopeConfig(branch.scope).bg)">
            <component :is="getScopeConfig(branch.scope).icon" :class="cn('size-5', getScopeConfig(branch.scope).color)" />
          </div>

          <!-- Branch info -->
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="font-mono text-sm font-medium text-foreground truncate">
                {{ branch.target || branch.scope }}
              </span>
              <Badge v-if="branch.current" variant="outline" class="text-[10px] border-primary/30 text-primary">
                current
              </Badge>
            </div>
            <div class="flex items-center gap-2 mt-1">
              <span class="font-mono text-xs text-muted-foreground truncate">{{ branch.name }}</span>
              <span v-if="branch.timestamp" class="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock class="size-3" />
                {{ formatTimestamp(branch.timestamp) }}
              </span>
            </div>
          </div>

          <!-- Scope badge -->
          <Badge :class="cn(getScopeConfig(branch.scope).bg, getScopeConfig(branch.scope).color)" class="text-[10px] uppercase shrink-0">
            {{ getScopeConfig(branch.scope).label }}
          </Badge>

          <!-- Arrow -->
          <ChevronRight class="size-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
        </button>
      </div>

      <StudioHint id="branches" message="Share branch reviews with your team in Contentrain Studio." class="mt-6" />
    </div>
  </div>
</template>

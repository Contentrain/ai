<script setup lang="ts">
import { onMounted, computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useContentStore } from '@/stores/content'
import type { HistoryEntry } from '@/stores/content'
import { useWatch } from '@/composables/useWatch'
import { formatRelativeTime } from '@/composables/useFormatters'
import {
  GitBranch, RefreshCw, FileText, Database, Languages, ShieldCheck,
  ChevronRight, Clock, History, Layers, Box, Trash2, GitMerge,
  Settings, ScanSearch,
} from 'lucide-vue-next'
import PageHeader from '@/components/layout/PageHeader.vue'
import StudioHint from '@/components/layout/StudioHint.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

const store = useContentStore()
const router = useRouter()
const activeTab = ref('pending')

// ─── Pending Branches ───

const branches = computed(() => store.branches)

interface ParsedBranch {
  name: string; scope: string; target: string; timestamp: string; current: boolean
}

function parseBranch(branch: { name: string; current: boolean }): ParsedBranch {
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
  normalize: { icon: ScanSearch, color: 'text-status-warning', bg: 'bg-status-warning/10', label: 'Normalize' },
  validate: { icon: ShieldCheck, color: 'text-status-success', bg: 'bg-status-success/10', label: 'Validate' },
}
const defaultScopeConfig = { icon: GitBranch, color: 'text-muted-foreground', bg: 'bg-muted', label: 'Branch' }
function getScopeConfig(scope: string) { return scopeConfig[scope] ?? defaultScopeConfig }

// ─── History ───

const historyEntries = computed(() => store.history)

const historyTypeConfig: Record<string, { icon: typeof Box; color: string; bg: string; label: string }> = {
  model_create: { icon: Box, color: 'text-status-info', bg: 'bg-status-info/10', label: 'Model Created' },
  model_update: { icon: Settings, color: 'text-status-info', bg: 'bg-status-info/10', label: 'Model Updated' },
  content_save: { icon: FileText, color: 'text-primary', bg: 'bg-primary/10', label: 'Content Saved' },
  delete: { icon: Trash2, color: 'text-status-error', bg: 'bg-status-error/10', label: 'Deleted' },
  merge: { icon: GitMerge, color: 'text-status-success', bg: 'bg-status-success/10', label: 'Merged' },
  context_update: { icon: Layers, color: 'text-muted-foreground', bg: 'bg-muted', label: 'Context' },
  operation: { icon: Settings, color: 'text-muted-foreground', bg: 'bg-muted', label: 'Operation' },
}
const defaultHistoryConfig = { icon: GitBranch, color: 'text-muted-foreground', bg: 'bg-muted', label: 'Other' }
function getHistoryConfig(type: string) { return historyTypeConfig[type] ?? defaultHistoryConfig }

// Group history by date
const groupedHistory = computed(() => {
  const groups: Array<{ date: string; entries: HistoryEntry[] }> = []
  let currentDate = ''
  for (const entry of historyEntries.value) {
    const d = new Date(entry.date)
    const dateStr = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    if (dateStr !== currentDate) {
      currentDate = dateStr
      groups.push({ date: dateStr, entries: [] })
    }
    groups[groups.length - 1].entries.push(entry)
  }
  return groups
})

// ─── Actions ───

function refresh() {
  store.fetchBranches()
  store.fetchHistory()
}

onMounted(() => { refresh() })

useWatch((event) => {
  if (event.type === 'branch:created' || event.type === 'branch:merged') refresh()
})
</script>

<template>
  <div>
    <PageHeader title="Branches & History" description="Review pending changes and track operations">
      <template #actions>
        <Button variant="outline" size="sm" :disabled="store.loading" @click="refresh()">
          <RefreshCw class="size-4" :class="store.loading && 'animate-spin'" /> Refresh
        </Button>
      </template>
    </PageHeader>

    <div class="px-6 py-6">
      <Tabs v-model="activeTab" class="w-full">
        <TabsList class="mb-6">
          <TabsTrigger value="pending" class="gap-1.5">
            <GitBranch class="size-3.5" />
            Pending
            <Badge v-if="branches.length > 0" variant="secondary" class="ml-1 h-5 px-1.5 text-[10px]">
              {{ branches.length }}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="history" class="gap-1.5">
            <History class="size-3.5" />
            History
          </TabsTrigger>
        </TabsList>

        <!-- Pending Tab -->
        <TabsContent value="pending">
          <!-- Loading -->
          <div v-if="store.loading && branches.length === 0" class="flex justify-center py-12">
            <div class="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>

          <!-- Empty -->
          <div v-else-if="branches.length === 0" class="flex flex-col items-center py-16 text-center">
            <img src="/merge-1.svg" alt="" class="empty-illustration mb-6" />
            <h2 class="text-lg font-semibold">No pending branches</h2>
            <p class="mt-2 max-w-sm text-sm text-muted-foreground">
              AI-generated changes from your IDE will appear here for review.
            </p>
          </div>

          <!-- Branch list -->
          <div v-else class="space-y-2">
            <button v-for="branch in parsedBranches" :key="branch.name"
              class="group flex w-full items-center gap-4 rounded-xl border border-border bg-card p-4 text-left transition-all hover:border-primary/30 hover:shadow-sm"
              @click="router.push(`/branches/${encodeURIComponent(branch.name)}`)">
              <div :class="cn('flex size-10 items-center justify-center rounded-lg', getScopeConfig(branch.scope).bg)">
                <component :is="getScopeConfig(branch.scope).icon"
                  :class="cn('size-5', getScopeConfig(branch.scope).color)" />
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="font-mono text-sm font-medium text-foreground truncate">
                    {{ branch.target || branch.scope }}
                  </span>
                </div>
                <span class="font-mono text-xs text-muted-foreground truncate">{{ branch.name }}</span>
              </div>
              <Badge :class="cn(getScopeConfig(branch.scope).bg, getScopeConfig(branch.scope).color)"
                class="text-[10px] uppercase shrink-0">
                {{ getScopeConfig(branch.scope).label }}
              </Badge>
              <ChevronRight
                class="size-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
            </button>
          </div>
        </TabsContent>

        <!-- History Tab -->
        <TabsContent value="history">
          <div v-if="store.loading && historyEntries.length === 0" class="flex justify-center py-12">
            <div class="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>

          <div v-else-if="historyEntries.length === 0" class="flex flex-col items-center py-16 text-center">
            <History class="mb-4 size-12 text-muted-foreground/30" />
            <h2 class="text-lg font-semibold">No history yet</h2>
            <p class="mt-2 text-sm text-muted-foreground">Contentrain operations will appear here as a timeline.</p>
          </div>

          <div v-else class="space-y-8">
            <section v-for="group in groupedHistory" :key="group.date">
              <!-- Date header -->
              <div class="sticky top-0 z-10 mb-3 flex items-center gap-2 bg-background/95 backdrop-blur py-1">
                <div class="h-px flex-1 bg-border" />
                <span class="shrink-0 text-xs font-medium text-muted-foreground">{{ group.date }}</span>
                <div class="h-px flex-1 bg-border" />
              </div>

              <!-- Timeline -->
              <div class="relative ml-5 border-l-2 border-border pl-6 space-y-4">
                <div v-for="entry in group.entries" :key="entry.hash" class="relative">
                  <!-- Timeline dot -->
                  <div :class="cn(
                    'absolute -left-7.75 flex size-5 items-center justify-center rounded-full border-2 border-background',
                    getHistoryConfig(entry.type).bg,
                  )">
                    <component :is="getHistoryConfig(entry.type).icon"
                      :class="cn('size-2.5', getHistoryConfig(entry.type).color)" />
                  </div>

                  <!-- Entry card -->
                  <div class="rounded-lg border border-border bg-card p-3">
                    <div class="flex items-start gap-2">
                      <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2 flex-wrap">
                          <Badge variant="secondary" class="text-[10px]">{{ getHistoryConfig(entry.type).label }}
                          </Badge>
                          <span v-if="entry.target" class="font-mono text-xs font-medium text-foreground truncate">
                            {{ entry.target }}
                          </span>
                        </div>
                        <p class="mt-1 text-xs text-muted-foreground truncate">{{ entry.message }}</p>
                      </div>
                      <div class="flex flex-col items-end gap-0.5 shrink-0">
                        <span class="text-[10px] text-muted-foreground">{{ entry.relativeDate }}</span>
                        <span class="font-mono text-[10px] text-muted-foreground/50">{{ entry.hash }}</span>
                      </div>
                    </div>
                    <div class="mt-1.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span>by {{ entry.author }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </TabsContent>
      </Tabs>

      <StudioHint id="branches" message="Share branch reviews with your team in Contentrain Studio." class="mt-6" />
    </div>
  </div>
</template>

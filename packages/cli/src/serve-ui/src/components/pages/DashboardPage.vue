<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useProjectStore } from '@/stores/project'
import type { ModelSummary } from '@/stores/project'
import { useContentStore, type HistoryEntry } from '@/stores/content'
import { useWatch } from '@/composables/useWatch'
import PageHeader from '@/components/layout/PageHeader.vue'
import StudioHint from '@/components/layout/StudioHint.vue'
import { Badge } from '@/components/ui/badge'
import { TrustBadge } from '@/components/ui/trust-badge'
import { cn } from '@/lib/utils'
import {
  Box,
  FileText,
  Languages,
  GitBranch,
  ShieldAlert,
  BookOpen,
  Globe,
  ArrowRight,
  Layers,
  FileCode,
  BookMarked,
  Activity,
  Settings,
  CircleDot,
  GitMerge,
  Trash2,
  Clock,
} from 'lucide-vue-next'

const project = useProjectStore()
const router = useRouter()
const contentStore = useContentStore()

const totalEntries = computed(() => {
  const ctx = project.status?.context
  if (!ctx?.stats) return 0
  const s = ctx.stats as Record<string, unknown>
  return typeof s['total_entries'] === 'number' ? s['total_entries'] : 0
})

const stats = computed(() => {
  const s = project.status
  if (!s) return []
  return [
    { icon: Box, label: 'Models', value: s.models.length, to: '/models', color: 'text-blue-500', bg: 'bg-blue-500/10' },
    { icon: FileText, label: 'Entries', value: totalEntries.value, to: undefined as string | undefined, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
    { icon: Languages, label: 'Locales', value: s.config?.locales.supported.length ?? 0, subtitle: s.config?.locales.supported.join(', ') ?? '—', to: undefined as string | undefined, color: 'text-violet-500', bg: 'bg-violet-500/10' },
    { icon: GitBranch, label: 'Branches', value: s.branches?.unmerged ?? 0, subtitle: s.branches ? `${s.branches.total} total` : undefined, to: '/branches', color: 'text-orange-500', bg: 'bg-orange-500/10' },
    ...(s.validation && (s.validation.errors > 0 || s.validation.warnings > 0)
      ? [{ icon: ShieldAlert, label: 'Issues', value: s.validation.errors + s.validation.warnings, subtitle: `${s.validation.errors}E ${s.validation.warnings}W`, to: '/validate', color: 'text-red-500', bg: 'bg-red-500/10', warn: true }]
      : []),
  ]
})

const workflowMode = computed(() => project.status?.config?.workflow ?? null)

const dashboardTrustStatus = computed(() => {
  const v = project.status?.validation
  if (!v) return 'pending' as const
  if (v.errors > 0) return 'warning' as const
  if (v.warnings > 0) return 'partial' as const
  return 'validated' as const
})

const dashboardTrustCount = computed(() => {
  const v = project.status?.validation
  if (!v) return 0
  return v.errors + v.warnings
})

const kindConfig: Record<string, { icon: typeof Box; color: string; badgeCls: string }> = {
  collection: { icon: Layers, color: 'text-blue-500', badgeCls: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300' },
  singleton: { icon: FileCode, color: 'text-teal-500', badgeCls: 'border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-800 dark:bg-teal-950 dark:text-teal-300' },
  document: { icon: BookOpen, color: 'text-green-500', badgeCls: 'border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-300' },
  dictionary: { icon: BookMarked, color: 'text-amber-500', badgeCls: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300' },
}

function getKindConfig(kind: string) {
  return kindConfig[kind] ?? kindConfig['collection']
}

function collectionCardClass(_model: ModelSummary): string {
  return 'border-border bg-gradient-to-b from-secondary/30 to-card hover:from-primary/8 hover:border-primary/20 hover:shadow-md'
}

const models = computed(() => project.status?.models ?? [])

const timelineLoading = ref(false)
const timeline = ref<HistoryEntry[]>([])

async function loadTimeline() {
  timelineLoading.value = true
  try {
    await contentStore.fetchHistory(15)
    timeline.value = contentStore.history
  } finally {
    timelineLoading.value = false
  }
}

onMounted(() => {
  loadTimeline()
})

useWatch((event) => {
  if (['branch:created', 'branch:merged', 'context:changed'].includes(event.type)) {
    loadTimeline()
  }
})

const operationConfig: Record<string, { icon: typeof Box; color: string; bg: string; label: string }> = {
  model_create: { icon: Box, color: 'text-blue-500', bg: 'bg-blue-500/10', label: 'Model Created' },
  model_update: { icon: Settings, color: 'text-blue-400', bg: 'bg-blue-400/10', label: 'Model Updated' },
  content_save: { icon: FileText, color: 'text-emerald-500', bg: 'bg-emerald-500/10', label: 'Content Saved' },
  delete: { icon: Trash2, color: 'text-red-500', bg: 'bg-red-500/10', label: 'Deleted' },
  merge: { icon: GitMerge, color: 'text-violet-500', bg: 'bg-violet-500/10', label: 'Merged' },
  context_update: { icon: Activity, color: 'text-gray-400', bg: 'bg-gray-400/10', label: 'Context Updated' },
  operation: { icon: CircleDot, color: 'text-primary', bg: 'bg-primary/10', label: 'Operation' },
  other: { icon: CircleDot, color: 'text-muted-foreground', bg: 'bg-muted', label: 'Other' },
}

function getOpConfig(type: string) {
  return operationConfig[type] ?? operationConfig['other']
}

const stackLabel = computed(() => project.status?.config?.stack ?? null)
</script>

<template>
  <div>
    <PageHeader title="Dashboard" description="Your project at a glance" />

    <div class="px-6 py-6 space-y-8">
      <!-- Loading -->
      <div v-if="project.loading && !project.status" class="flex items-center justify-center py-20">
        <div class="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>

      <!-- Error -->
      <div v-else-if="project.error" class="rounded-xl border border-destructive/20 bg-destructive/5 p-6 text-center">
        <ShieldAlert class="mx-auto mb-3 size-8 text-destructive/60" />
        <p class="text-sm font-medium text-destructive">{{ project.error }}</p>
      </div>

      <!-- Not initialized -->
      <div v-else-if="project.status && !project.status.initialized" class="flex flex-col items-center justify-center py-20 text-center">
        <img src="/model-empty-state.svg" alt="" class="empty-illustration mb-6" />
        <h2 class="text-lg font-semibold text-foreground">Not a Contentrain project</h2>
        <p class="mt-2 max-w-sm text-sm text-muted-foreground">
          Run <code class="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">contentrain init</code> to initialize.
        </p>
      </div>

      <!-- Dashboard content -->
      <template v-else-if="project.status">
        <!-- Project info bar -->
        <div class="flex flex-wrap items-center gap-3">
          <Badge v-if="stackLabel" variant="secondary" class="gap-1.5">
            <Settings class="size-3" /> {{ stackLabel }}
          </Badge>
          <Badge v-if="workflowMode" :variant="workflowMode === 'review' ? 'outline' : 'secondary'" class="gap-1.5">
            <GitBranch class="size-3" /> {{ workflowMode === 'review' ? 'Review workflow' : 'Auto-merge' }}
          </Badge>
          <Badge v-if="project.status.config?.locales" variant="secondary" class="gap-1.5">
            <Globe class="size-3" /> {{ project.status.config.locales.default }}
            <span v-if="project.status.config.locales.supported.length > 1" class="text-muted-foreground">
              +{{ project.status.config.locales.supported.length - 1 }}
            </span>
          </Badge>
          <Badge v-if="project.status.vocabulary_size > 0" variant="secondary" class="gap-1.5">
            <BookMarked class="size-3" /> {{ project.status.vocabulary_size }} terms
          </Badge>
          <TrustBadge :status="dashboardTrustStatus" :count="dashboardTrustCount" />
        </div>

        <!-- Stat cards -->
        <div class="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <button
            v-for="stat in stats"
            :key="stat.label"
            :class="cn(
              'group flex flex-col gap-2 rounded-xl border p-4 text-left transition-all duration-200',
              stat.warn
                ? 'border-status-warning/30 bg-gradient-to-b from-status-warning/8 to-card'
                : 'border-border bg-card hover:border-primary/20 hover:shadow-sm',
              stat.to ? 'cursor-pointer' : 'cursor-default',
            )"
            @click="stat.to && router.push(stat.to)"
          >
            <div class="flex items-center justify-between">
              <div :class="cn('flex size-8 items-center justify-center rounded-lg', stat.warn ? 'bg-status-warning/10' : stat.bg)">
                <component :is="stat.icon" :class="cn('size-4', stat.warn ? 'text-status-warning' : stat.color)" />
              </div>
              <ArrowRight v-if="stat.to" class="size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
            </div>
            <div>
              <span class="text-2xl font-bold text-foreground">{{ stat.value }}</span>
              <p class="text-xs font-medium text-muted-foreground">{{ stat.label }}</p>
              <p v-if="'subtitle' in stat && stat.subtitle" class="mt-0.5 text-[10px] text-muted-foreground/70">{{ stat.subtitle }}</p>
            </div>
          </button>
        </div>

        <!-- Collections grid -->
        <section>
          <div class="mb-4 flex items-center justify-between">
            <h2 class="text-sm font-semibold text-foreground">Content Models</h2>
            <button v-if="models.length > 0" class="flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-primary" @click="router.push('/models')">
              View all <ArrowRight class="size-3" />
            </button>
          </div>

          <div v-if="models.length > 0" class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            <button
              v-for="model in models"
              :key="model.id"
              :class="cn('group flex flex-col gap-3 rounded-xl border p-4 text-left transition-all duration-200', collectionCardClass(model))"
              @click="router.push(`/content/${model.id}`)"
            >
              <div class="flex items-center justify-between gap-2">
                <div class="flex items-center gap-2 min-w-0">
                  <component :is="getKindConfig(model.kind).icon" :class="cn('size-4 shrink-0', getKindConfig(model.kind).color)" />
                  <span class="truncate font-medium text-foreground">{{ model.id }}</span>
                </div>
                <span :class="cn('shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium', getKindConfig(model.kind).badgeCls)">
                  {{ model.kind }}
                </span>
              </div>
              <div class="flex items-center gap-3 text-xs text-muted-foreground">
                <span class="flex items-center gap-1"><Box class="size-3 opacity-50" /> {{ model.fields }} fields</span>
                <span class="rounded bg-muted px-1.5 py-0.5 text-[10px]">{{ model.domain }}</span>
                <span v-if="model.i18n" class="flex items-center gap-1"><Globe class="size-3 opacity-50" /> i18n</span>
              </div>
              <div class="flex items-center justify-end">
                <ArrowRight class="size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              </div>
            </button>
          </div>

          <!-- Empty state -->
          <div v-else class="flex flex-col items-center rounded-xl border border-dashed border-border py-16 text-center">
            <img src="/model-empty-state.svg" alt="" class="empty-illustration mb-5" />
            <h3 class="text-sm font-semibold text-foreground">No content models yet</h3>
            <p class="mt-1.5 max-w-xs text-xs text-muted-foreground">Create models using AI in your IDE to get started.</p>
          </div>
        </section>

        <!-- Operation Timeline -->
        <section>
          <div class="mb-4 flex items-center justify-between">
            <div class="flex items-center gap-2">
              <Activity class="size-4 text-muted-foreground" />
              <h2 class="text-sm font-semibold text-foreground">Recent Operations</h2>
            </div>
            <button
              class="flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-primary"
              @click="router.push('/branches')"
            >
              View all
              <ArrowRight class="size-3" />
            </button>
          </div>

          <!-- Loading -->
          <div v-if="timelineLoading && timeline.length === 0" class="flex justify-center py-8">
            <div class="size-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>

          <!-- Empty -->
          <div v-else-if="timeline.length === 0" class="flex flex-col items-center rounded-xl border border-dashed border-border py-10 text-center">
            <Clock class="size-6 text-muted-foreground/50 mb-2" />
            <p class="text-xs text-muted-foreground">No operations yet. Start by creating models or content.</p>
          </div>

          <!-- Timeline list -->
          <div v-else class="relative space-y-0">
            <!-- Vertical line -->
            <div class="absolute left-[19px] top-2 bottom-2 w-px bg-border" />

            <div
              v-for="entry in timeline.slice(0, 10)"
              :key="entry.hash"
              class="relative flex items-start gap-3 py-2.5 pl-0"
            >
              <!-- Timeline dot -->
              <div :class="cn('relative z-10 flex size-10 shrink-0 items-center justify-center rounded-lg', getOpConfig(entry.type).bg)">
                <component :is="getOpConfig(entry.type).icon" :class="cn('size-4', getOpConfig(entry.type).color)" />
              </div>

              <!-- Content -->
              <div class="flex-1 min-w-0 pt-1">
                <div class="flex items-center gap-2">
                  <span class="text-xs font-medium text-foreground">{{ getOpConfig(entry.type).label }}</span>
                  <span v-if="entry.target" class="truncate font-mono text-xs text-muted-foreground">{{ entry.target }}</span>
                </div>
                <div class="flex items-center gap-2 mt-0.5">
                  <span class="text-[10px] text-muted-foreground">{{ entry.relativeDate }}</span>
                  <span class="text-[10px] text-muted-foreground/50">{{ entry.hash }}</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- Validation summary -->
        <section v-if="project.status.validation && project.status.validation.summary.length > 0">
          <div class="mb-4 flex items-center justify-between">
            <div class="flex items-center gap-2">
              <ShieldAlert class="size-4 text-status-warning" />
              <h2 class="text-sm font-semibold text-foreground">Validation Summary</h2>
            </div>
            <button class="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-primary" @click="router.push('/validate')">
              Full report <ArrowRight class="size-3" />
            </button>
          </div>
          <div class="rounded-xl border border-status-warning/20 bg-gradient-to-b from-status-warning/5 to-card p-4">
            <ul class="space-y-1.5">
              <li v-for="(msg, i) in project.status.validation.summary.slice(0, 5)" :key="i" class="flex items-start gap-2 text-xs text-muted-foreground">
                <span class="mt-1.5 size-1 shrink-0 rounded-full bg-status-warning" />
                {{ msg }}
              </li>
            </ul>
          </div>
        </section>

        <StudioHint id="dashboard" message="Manage content with AI chat and team review in Contentrain Studio." />
      </template>
    </div>
  </div>
</template>

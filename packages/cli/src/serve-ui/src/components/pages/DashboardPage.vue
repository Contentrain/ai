<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useProjectStore } from '@/stores/project'
import {
  Box,
  FileText,
  Languages,
  GitBranch,
  ShieldAlert,
} from 'lucide-vue-next'
import PageHeader from '@/components/layout/PageHeader.vue'
import StudioHint from '@/components/layout/StudioHint.vue'
import { cn } from '@/lib/utils'

const project = useProjectStore()
const router = useRouter()

const stats = computed(() => {
  const s = project.status
  if (!s) return []
  return [
    { icon: Box, label: 'Models', value: s.models.length, to: '/models' },
    { icon: FileText, label: 'Entries', value: totalEntries.value },
    { icon: Languages, label: 'Locales', value: s.config?.locales.supported.join(', ') ?? '—' },
    { icon: GitBranch, label: 'Branches', value: s.branches?.unmerged ?? 0, to: '/branches' },
    ...(s.validation && (s.validation.errors > 0 || s.validation.warnings > 0)
      ? [{ icon: ShieldAlert, label: 'Issues', value: `${s.validation.errors}e ${s.validation.warnings}w`, to: '/validate', warn: true }]
      : []),
  ]
})

const totalEntries = computed(() => {
  const ctx = project.status?.context
  if (!ctx?.stats) return 0
  const s = ctx.stats as Record<string, unknown>
  return typeof s['total_entries'] === 'number' ? s['total_entries'] : 0
})

const models = computed(() => project.status?.models ?? [])

function modelGradient(model: { id: string }): string {
  const validation = project.status?.validation
  if (validation && validation.errors > 0) return 'border-destructive/20 bg-gradient-to-b from-destructive/5 to-card'
  if (validation && validation.warnings > 0) return 'border-status-warning/20 bg-gradient-to-b from-status-warning/5 to-card'
  return 'border-border bg-gradient-to-b from-secondary/30 to-card hover:from-primary/8 hover:border-primary/20'
}

const recentActivity = computed(() => {
  const ctx = project.status?.context
  if (!ctx?.lastOperation) return []
  const op = ctx.lastOperation as Record<string, unknown>
  if (!op['tool']) return []
  return [{ tool: op['tool'] as string, target: (op['target'] ?? '') as string, time: 'recent' }]
})
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
      <div v-else-if="project.error" class="rounded-lg border border-destructive/20 bg-destructive/5 p-6 text-center">
        <p class="text-sm text-destructive">{{ project.error }}</p>
      </div>

      <!-- Not initialized -->
      <div v-else-if="project.status && !project.status.initialized" class="flex flex-col items-center justify-center py-20 text-center">
        <img src="/model-empty-state.svg" alt="" class="mb-6 h-32 opacity-60" />
        <h2 class="text-lg font-semibold text-foreground">Not a Contentrain project</h2>
        <p class="mt-2 text-sm text-muted-foreground">
          Run <code class="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">contentrain init</code> to get started.
        </p>
      </div>

      <!-- Dashboard content -->
      <template v-else-if="project.status">
        <!-- Stat cards -->
        <div class="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <button
            v-for="stat in stats"
            :key="stat.label"
            :class="cn(
              'flex flex-col gap-1 rounded-lg border p-4 text-left transition-colors',
              stat.warn
                ? 'border-status-warning/20 bg-gradient-to-b from-status-warning/5 to-card'
                : 'border-border bg-card hover:bg-accent/50',
            )"
            @click="stat.to && router.push(stat.to)"
          >
            <div class="flex items-center gap-2">
              <component :is="stat.icon" class="size-4 text-muted-foreground" />
              <span class="text-xs font-medium text-muted-foreground">{{ stat.label }}</span>
            </div>
            <span class="text-xl font-semibold text-foreground">{{ stat.value }}</span>
          </button>
        </div>

        <!-- Collections grid -->
        <section>
          <h2 class="mb-4 text-sm font-medium text-muted-foreground">Collections</h2>
          <div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <button
              v-for="model in models"
              :key="model.id"
              :class="cn(
                'flex flex-col gap-2 rounded-lg border p-4 text-left transition-all',
                modelGradient(model),
              )"
              @click="router.push(`/content/${model.id}`)"
            >
              <div class="flex items-center justify-between">
                <span class="font-medium text-foreground">{{ model.id }}</span>
                <span class="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                  {{ model.kind }}
                </span>
              </div>
              <div class="flex items-center gap-3 text-xs text-muted-foreground">
                <span>{{ model.fields }} fields</span>
                <span>{{ model.domain }}</span>
                <span v-if="model.i18n">i18n</span>
              </div>
            </button>
          </div>

          <!-- Empty state -->
          <div v-if="models.length === 0" class="flex flex-col items-center py-12 text-center">
            <img src="/model-empty-state.svg" alt="" class="mb-4 h-24 opacity-50" />
            <p class="text-sm text-muted-foreground">No content models yet. Create models using AI in your IDE.</p>
          </div>
        </section>

        <!-- Recent activity -->
        <section v-if="recentActivity.length > 0">
          <h2 class="mb-4 text-sm font-medium text-muted-foreground">Recent Activity</h2>
          <div class="space-y-2">
            <div
              v-for="(activity, i) in recentActivity"
              :key="i"
              class="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-2.5 text-sm"
            >
              <span class="size-1.5 rounded-full bg-primary" />
              <span class="font-mono text-xs text-muted-foreground">{{ activity.tool }}</span>
              <span class="text-foreground">{{ activity.target }}</span>
              <span class="ml-auto text-xs text-muted-foreground">{{ activity.time }}</span>
            </div>
          </div>
        </section>

        <!-- Studio hint -->
        <StudioHint
          id="dashboard"
          message="Manage content with AI chat and team review in Contentrain Studio."
        />
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, computed } from 'vue'
import { useContentStore } from '@/stores/content'
import { ShieldCheck, ShieldAlert, AlertTriangle, CircleAlert, Info, RefreshCw } from 'lucide-vue-next'
import PageHeader from '@/components/layout/PageHeader.vue'
import StudioHint from '@/components/layout/StudioHint.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const store = useContentStore()

const validation = computed(() => store.validation)
const issues = computed(() => validation.value?.issues ?? [])
const summary = computed(() => validation.value?.summary)

const severityConfig: Record<string, { icon: typeof CircleAlert; color: string; bg: string }> = {
  error: { icon: CircleAlert, color: 'text-status-error', bg: 'bg-status-error/10' },
  warning: { icon: AlertTriangle, color: 'text-status-warning', bg: 'bg-status-warning/10' },
  notice: { icon: Info, color: 'text-status-info', bg: 'bg-status-info/10' },
}

onMounted(() => { store.fetchValidation() })
</script>

<template>
  <div>
    <PageHeader title="Validation" description="Content quality report">
      <template #actions>
        <Button variant="outline" size="sm" :disabled="store.loading" @click="store.fetchValidation()">
          <RefreshCw class="mr-1.5 size-4" :class="store.loading && 'animate-spin'" /> Run Again
        </Button>
      </template>
    </PageHeader>

    <div class="px-6 py-6 space-y-6">
      <!-- Loading -->
      <div v-if="store.loading && !validation" class="flex justify-center py-12">
        <div class="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>

      <template v-else-if="validation">
        <!-- Summary cards -->
        <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div class="flex items-center gap-3 rounded-lg border border-border bg-card p-4">
            <div class="flex size-9 items-center justify-center rounded-lg bg-status-error/10">
              <CircleAlert class="size-5 text-status-error" />
            </div>
            <div>
              <div class="text-xl font-semibold">{{ summary?.errors ?? 0 }}</div>
              <div class="text-xs text-muted-foreground">Errors</div>
            </div>
          </div>
          <div class="flex items-center gap-3 rounded-lg border border-border bg-card p-4">
            <div class="flex size-9 items-center justify-center rounded-lg bg-status-warning/10">
              <AlertTriangle class="size-5 text-status-warning" />
            </div>
            <div>
              <div class="text-xl font-semibold">{{ summary?.warnings ?? 0 }}</div>
              <div class="text-xs text-muted-foreground">Warnings</div>
            </div>
          </div>
          <div class="flex items-center gap-3 rounded-lg border border-border bg-card p-4">
            <div class="flex size-9 items-center justify-center rounded-lg bg-status-success/10">
              <ShieldCheck class="size-5 text-status-success" />
            </div>
            <div>
              <div class="text-xl font-semibold">{{ summary?.models_checked ?? 0 }}</div>
              <div class="text-xs text-muted-foreground">Models checked</div>
            </div>
          </div>
          <div class="flex items-center gap-3 rounded-lg border border-border bg-card p-4">
            <div class="flex size-9 items-center justify-center rounded-lg bg-muted">
              <ShieldAlert class="size-5 text-muted-foreground" />
            </div>
            <div>
              <div class="text-xl font-semibold">{{ summary?.entries_checked ?? 0 }}</div>
              <div class="text-xs text-muted-foreground">Entries checked</div>
            </div>
          </div>
        </div>

        <!-- All passed -->
        <div v-if="issues.length === 0" class="flex flex-col items-center py-12 text-center">
          <div class="flex size-16 items-center justify-center rounded-full bg-status-success/10 mb-4">
            <ShieldCheck class="size-8 text-status-success" />
          </div>
          <h2 class="text-lg font-semibold">All checks passed</h2>
          <p class="mt-1 text-sm text-muted-foreground">Your content is in great shape.</p>
        </div>

        <!-- Issues list -->
        <div v-else class="space-y-2">
          <div
            v-for="(issue, i) in issues"
            :key="i"
            :class="cn(
              'flex items-start gap-3 rounded-lg border p-4',
              issue.severity === 'error' ? 'border-status-error/20 bg-status-error/5' :
              issue.severity === 'warning' ? 'border-status-warning/20 bg-status-warning/5' :
              'border-border bg-card'
            )"
          >
            <div :class="cn('mt-0.5', severityConfig[issue.severity]?.color ?? 'text-muted-foreground')">
              <component :is="severityConfig[issue.severity]?.icon ?? Info" class="size-4" />
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <Badge :variant="issue.severity === 'error' ? 'destructive' : 'secondary'" class="text-[10px] uppercase">
                  {{ issue.severity }}
                </Badge>
                <span v-if="issue.model" class="font-mono text-xs text-muted-foreground">{{ issue.model }}</span>
                <span v-if="issue.entry" class="font-mono text-xs text-muted-foreground">{{ issue.entry }}</span>
                <span v-if="issue.field" class="font-mono text-xs text-muted-foreground">.{{ issue.field }}</span>
                <Badge v-if="issue.locale" variant="outline" class="text-[10px]">{{ issue.locale }}</Badge>
              </div>
              <p class="mt-1 text-sm text-foreground">{{ issue.message }}</p>
            </div>
          </div>
        </div>
      </template>

      <StudioHint id="validate" message="Set up CI quality gates to catch issues automatically." class="mt-4" />
    </div>
  </div>
</template>

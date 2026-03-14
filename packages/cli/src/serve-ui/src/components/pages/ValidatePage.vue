<script setup lang="ts">
import { onMounted, computed, ref, Transition } from 'vue'
import { useContentStore } from '@/stores/content'
import {
  ShieldCheck, ShieldAlert, AlertTriangle, CircleAlert, Info, RefreshCw,
  ChevronDown, Filter, FileWarning, Database, ListChecks,
} from 'lucide-vue-next'
import PageHeader from '@/components/layout/PageHeader.vue'
import StudioHint from '@/components/layout/StudioHint.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

const store = useContentStore()

const validation = computed(() => store.validation)
const summary = computed(() => validation.value?.summary)
const allIssues = computed(() => validation.value?.issues ?? [])

// Severity filter toggles
const showErrors = ref(true)
const showWarnings = ref(true)
const showNotices = ref(true)

// Group sections open state
const errorsOpen = ref(true)
const warningsOpen = ref(true)
const noticesOpen = ref(true)

const severityConfig = {
  error: { icon: CircleAlert, color: 'text-status-error', bg: 'bg-status-error/10', border: 'border-status-error/20', label: 'Errors' },
  warning: { icon: AlertTriangle, color: 'text-status-warning', bg: 'bg-status-warning/10', border: 'border-status-warning/20', label: 'Warnings' },
  notice: { icon: Info, color: 'text-status-info', bg: 'bg-status-info/10', border: 'border-status-info/20', label: 'Notices' },
} as const

const errorIssues = computed(() => allIssues.value.filter(i => i.severity === 'error'))
const warningIssues = computed(() => allIssues.value.filter(i => i.severity === 'warning'))
const noticeIssues = computed(() => allIssues.value.filter(i => i.severity === 'notice'))

const filteredGroups = computed(() => {
  const groups: Array<{
    severity: 'error' | 'warning' | 'notice'
    issues: typeof allIssues.value
    open: typeof errorsOpen
  }> = []
  if (showErrors.value && errorIssues.value.length > 0) {
    groups.push({ severity: 'error', issues: errorIssues.value, open: errorsOpen })
  }
  if (showWarnings.value && warningIssues.value.length > 0) {
    groups.push({ severity: 'warning', issues: warningIssues.value, open: warningsOpen })
  }
  if (showNotices.value && noticeIssues.value.length > 0) {
    groups.push({ severity: 'notice', issues: noticeIssues.value, open: noticesOpen })
  }
  return groups
})

const hasAnyFiltered = computed(() => filteredGroups.value.length > 0)

// Run tracking
const lastRunAt = ref<Date | null>(null)
const runFeedback = ref<string | null>(null)

async function runValidation() {
  runFeedback.value = null
  await store.fetchValidation()
  lastRunAt.value = new Date()
  const s = store.validation?.summary
  if (s) {
    const total = s.errors + s.warnings + s.notices
    runFeedback.value = total === 0
      ? 'All checks passed!'
      : `Found ${s.errors} error(s), ${s.warnings} warning(s), ${s.notices} notice(s)`
    setTimeout(() => { runFeedback.value = null }, 4000)
  }
}

onMounted(() => { runValidation() })
</script>

<template>
  <div>
    <PageHeader title="Validation" description="Content quality report">
      <template #actions>
        <Button variant="outline" size="sm" :disabled="store.loading" @click="runValidation()">
          <RefreshCw class="size-4" :class="store.loading && 'animate-spin'" /> Run Again
        </Button>
      </template>
    </PageHeader>

    <div class="px-6 py-6 space-y-6">
      <!-- Run feedback banner -->
      <Transition
        enter-active-class="transition-all duration-300 ease-out"
        enter-from-class="opacity-0 -translate-y-2"
        leave-active-class="transition-all duration-200 ease-in"
        leave-to-class="opacity-0 -translate-y-2"
      >
        <div
          v-if="runFeedback"
          :class="cn(
            'flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm',
            validation?.valid
              ? 'border-status-success/30 bg-status-success/10 text-status-success'
              : 'border-status-warning/30 bg-status-warning/10 text-status-warning',
          )"
        >
          <component :is="validation?.valid ? ShieldCheck : ShieldAlert" class="size-4 shrink-0" />
          {{ runFeedback }}
          <span v-if="lastRunAt" class="ml-auto text-xs opacity-60">{{ lastRunAt.toLocaleTimeString() }}</span>
        </div>
      </Transition>

      <!-- Loading overlay when re-running -->
      <div v-if="store.loading && validation" class="flex items-center gap-2 text-sm text-muted-foreground">
        <div class="size-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        Running validation...
      </div>

      <!-- Initial loading -->
      <div v-if="store.loading && !validation" class="flex justify-center py-12">
        <div class="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>

      <template v-else-if="validation">
        <!-- Summary cards -->
        <div class="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Card class="border-status-error/20">
            <CardContent class="flex items-center gap-3 p-4">
              <div class="flex size-10 items-center justify-center rounded-lg bg-status-error/10">
                <CircleAlert class="size-5 text-status-error" />
              </div>
              <div>
                <div class="text-2xl font-bold tabular-nums">{{ summary?.errors ?? 0 }}</div>
                <div class="text-xs text-muted-foreground">Errors</div>
              </div>
            </CardContent>
          </Card>

          <Card class="border-status-warning/20">
            <CardContent class="flex items-center gap-3 p-4">
              <div class="flex size-10 items-center justify-center rounded-lg bg-status-warning/10">
                <AlertTriangle class="size-5 text-status-warning" />
              </div>
              <div>
                <div class="text-2xl font-bold tabular-nums">{{ summary?.warnings ?? 0 }}</div>
                <div class="text-xs text-muted-foreground">Warnings</div>
              </div>
            </CardContent>
          </Card>

          <Card class="border-status-info/20">
            <CardContent class="flex items-center gap-3 p-4">
              <div class="flex size-10 items-center justify-center rounded-lg bg-status-info/10">
                <Info class="size-5 text-status-info" />
              </div>
              <div>
                <div class="text-2xl font-bold tabular-nums">{{ summary?.notices ?? 0 }}</div>
                <div class="text-xs text-muted-foreground">Notices</div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent class="flex items-center gap-3 p-4">
              <div class="flex size-10 items-center justify-center rounded-lg bg-status-success/10">
                <Database class="size-5 text-status-success" />
              </div>
              <div>
                <div class="text-2xl font-bold tabular-nums">{{ summary?.models_checked ?? 0 }}</div>
                <div class="text-xs text-muted-foreground">Models</div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent class="flex items-center gap-3 p-4">
              <div class="flex size-10 items-center justify-center rounded-lg bg-muted">
                <ListChecks class="size-5 text-muted-foreground" />
              </div>
              <div>
                <div class="text-2xl font-bold tabular-nums">{{ summary?.entries_checked ?? 0 }}</div>
                <div class="text-xs text-muted-foreground">Entries</div>
              </div>
            </CardContent>
          </Card>
        </div>

        <!-- All passed -->
        <div v-if="allIssues.length === 0" class="flex flex-col items-center py-16 text-center">
          <div class="flex size-20 items-center justify-center rounded-full bg-status-success/10 mb-4">
            <ShieldCheck class="size-10 text-status-success" />
          </div>
          <h2 class="text-xl font-semibold">All checks passed</h2>
          <p class="mt-2 text-sm text-muted-foreground max-w-sm">
            Your content and models are in great shape. No errors, warnings, or notices found.
          </p>
        </div>

        <!-- Issues -->
        <template v-else>
          <!-- Severity filter -->
          <div class="flex items-center gap-2 flex-wrap">
            <Filter class="size-4 text-muted-foreground" />
            <Button
              :variant="showErrors ? 'default' : 'outline'"
              size="sm"
              class="h-7 text-xs"
              @click="showErrors = !showErrors"
            >
              <CircleAlert class="mr-1 size-3" />
              Errors ({{ errorIssues.length }})
            </Button>
            <Button
              :variant="showWarnings ? 'default' : 'outline'"
              size="sm"
              class="h-7 text-xs"
              @click="showWarnings = !showWarnings"
            >
              <AlertTriangle class="mr-1 size-3" />
              Warnings ({{ warningIssues.length }})
            </Button>
            <Button
              :variant="showNotices ? 'default' : 'outline'"
              size="sm"
              class="h-7 text-xs"
              @click="showNotices = !showNotices"
            >
              <Info class="mr-1 size-3" />
              Notices ({{ noticeIssues.length }})
            </Button>
          </div>

          <!-- Grouped issues -->
          <div v-if="hasAnyFiltered" class="space-y-4">
            <Collapsible
              v-for="group in filteredGroups"
              :key="group.severity"
              v-model:open="group.open.value"
            >
              <Card>
                <CollapsibleTrigger class="flex w-full items-center justify-between p-4 hover:bg-muted/50 transition-colors rounded-t-lg">
                  <div class="flex items-center gap-3">
                    <div :class="cn('flex size-8 items-center justify-center rounded-md', severityConfig[group.severity].bg)">
                      <component :is="severityConfig[group.severity].icon" :class="cn('size-4', severityConfig[group.severity].color)" />
                    </div>
                    <span class="font-medium text-sm">{{ severityConfig[group.severity].label }}</span>
                    <Badge variant="secondary" class="text-[10px]">{{ group.issues.length }}</Badge>
                  </div>
                  <ChevronDown class="size-4 text-muted-foreground transition-transform" :class="group.open.value && 'rotate-180'" />
                </CollapsibleTrigger>

                <CollapsibleContent>
                  <Separator />
                  <div class="divide-y divide-border">
                    <div
                      v-for="(issue, i) in group.issues"
                      :key="i"
                      :class="cn('flex items-start gap-3 p-4', severityConfig[group.severity].bg)"
                    >
                      <component
                        :is="severityConfig[group.severity].icon"
                        :class="cn('mt-0.5 size-4 shrink-0', severityConfig[group.severity].color)"
                      />
                      <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2 flex-wrap">
                          <Badge
                            :variant="issue.severity === 'error' ? 'destructive' : 'secondary'"
                            class="text-[10px] uppercase"
                          >
                            {{ issue.severity }}
                          </Badge>
                          <span v-if="issue.model" class="font-mono text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                            {{ issue.model }}
                          </span>
                          <span v-if="issue.entry" class="font-mono text-xs text-muted-foreground">
                            {{ issue.entry }}
                          </span>
                          <span v-if="issue.field" class="font-mono text-xs text-muted-foreground">
                            .{{ issue.field }}
                          </span>
                          <Badge v-if="issue.locale" variant="outline" class="text-[10px]">
                            {{ issue.locale }}
                          </Badge>
                        </div>
                        <p class="mt-1.5 text-sm text-foreground">{{ issue.message }}</p>
                      </div>
                    </div>
                  </div>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          </div>

          <!-- All filtered out -->
          <div v-else class="flex flex-col items-center py-12 text-center">
            <FileWarning class="size-8 text-muted-foreground mb-3" />
            <p class="text-sm text-muted-foreground">All issue types are hidden. Adjust filters above to see issues.</p>
          </div>
        </template>
      </template>

      <StudioHint id="validate" message="Set up CI quality gates to catch issues automatically." class="mt-4" />
    </div>
  </div>
</template>

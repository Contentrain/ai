<script setup lang="ts">
import { onMounted, computed, ref, Transition } from 'vue'
import { useRouter } from 'vue-router'
import { useContentStore } from '@/stores/content'
import { toast } from 'vue-sonner'
import {
  ShieldCheck, ShieldAlert, AlertTriangle, CircleAlert, Info, RefreshCw,
  ChevronDown, Filter, FileWarning, Database, ListChecks, Wrench, Loader2,
} from 'lucide-vue-next'
import PageHeader from '@/components/layout/PageHeader.vue'
import StudioHint from '@/components/layout/StudioHint.vue'
import { Badge } from '@/components/ui/badge'
import { TrustBadge } from '@/components/ui/trust-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

const store = useContentStore()
const router = useRouter()

const validation = computed(() => store.validation)
const summary = computed(() => validation.value?.summary)
const allIssues = computed(() => validation.value?.issues ?? [])

// Severity filter toggles
const showErrors = ref(true)
const showWarnings = ref(true)
const showNotices = ref(true)

// Group-by mode
const groupBy = ref<'severity' | 'model'>('severity')

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

// Model-grouped issues
const issuesByModel = computed(() => {
  const groups = new Map<string, typeof allIssues.value>()
  for (const issue of allIssues.value) {
    const key = issue.model ?? 'unknown'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(issue)
  }
  return [...groups.entries()].toSorted((a, b) => b[1].length - a[1].length)
})

// Run tracking
const lastRunAt = ref<Date | null>(null)
const runFeedback = ref<string | null>(null)

const fixing = ref(false)

async function runValidation() {
  runFeedback.value = null
  try {
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
  } catch {
    toast.error('Validation failed. Please try again.')
  }
}

async function runAutoFix() {
  runFeedback.value = null
  fixing.value = true
  try {
    await store.fetchValidationWithFix()
    lastRunAt.value = new Date()
    const s = store.validation?.summary
    if (s) {
      const total = s.errors + s.warnings + s.notices
      runFeedback.value = total === 0
        ? 'All issues fixed!'
        : `Fixed auto-fixable issues. ${s.errors} error(s), ${s.warnings} warning(s) remaining`
      setTimeout(() => { runFeedback.value = null }, 4000)
    }
    toast.success('Auto-fix completed successfully.')
  } catch {
    toast.error('Auto-fix failed. Please try again.')
  } finally {
    fixing.value = false
  }
}

onMounted(() => { runValidation() })
</script>

<template>
  <div>
    <PageHeader title="Validation" description="Content quality report">
      <template #actions>
        <TrustBadge
          :status="validation?.valid ? 'validated' : validation ? 'warning' : 'pending'"
          :count="(validation?.summary.errors ?? 0) + (validation?.summary.warnings ?? 0)"
        />
        <Button variant="outline" size="sm" :disabled="store.loading" @click="runValidation()">
          <Loader2 v-if="store.loading" class="size-4 animate-spin" />
          <RefreshCw v-else class="size-4" />
          Run Again
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
        <Loader2 class="size-4 animate-spin text-primary" />
        Running validation...
      </div>

      <!-- Initial loading -->
      <div v-if="store.loading && !validation" class="flex justify-center py-12">
        <Loader2 class="size-6 animate-spin text-primary" />
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
          <!-- Filters and group-by toggle -->
          <div class="flex items-center gap-2 flex-wrap">
            <Filter class="size-4 text-muted-foreground" />
            <!-- Group by toggle -->
            <div class="flex items-center border rounded-md overflow-hidden mr-2">
              <Button
                variant="ghost"
                size="sm"
                :class="cn('px-2.5 py-1 h-auto text-xs font-medium rounded-none transition-colors', groupBy === 'severity' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')"
                @click="groupBy = 'severity'"
              >
                By Severity
              </Button>
              <Button
                variant="ghost"
                size="sm"
                :class="cn('px-2.5 py-1 h-auto text-xs font-medium rounded-none transition-colors', groupBy === 'model' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')"
                @click="groupBy = 'model'"
              >
                By Model
              </Button>
            </div>
            <!-- Severity filter buttons -->
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
            <!-- Auto-fix button -->
            <Button variant="outline" size="sm" class="h-7 text-xs ml-auto" :disabled="store.loading || fixing" @click="runAutoFix()">
              <Loader2 v-if="fixing" class="mr-1 size-3 animate-spin" />
              <Wrench v-else class="mr-1 size-3" />
              Auto-fix
            </Button>
          </div>

          <!-- Model-grouped view -->
          <template v-if="groupBy === 'model'">
            <div class="space-y-4">
              <Collapsible v-for="[modelId, issues] in issuesByModel" :key="modelId" :default-open="issuesByModel.length <= 5">
                <Card>
                  <CollapsibleTrigger class="flex w-full items-center justify-between p-4 hover:bg-muted/50 transition-colors rounded-t-lg">
                    <div class="flex items-center gap-3">
                      <div class="flex size-8 items-center justify-center rounded-md bg-primary/10">
                        <Database class="size-4 text-primary" />
                      </div>
                      <span class="font-medium text-sm font-mono">{{ modelId }}</span>
                      <Badge variant="secondary" class="text-[10px]">{{ issues.length }}</Badge>
                      <Badge v-if="issues.filter(i => i.severity === 'error').length > 0" variant="destructive" class="text-[10px]">
                        {{ issues.filter(i => i.severity === 'error').length }}E
                      </Badge>
                      <Badge v-if="issues.filter(i => i.severity === 'warning').length > 0" variant="outline" class="text-[10px] border-status-warning/50 text-status-warning">
                        {{ issues.filter(i => i.severity === 'warning').length }}W
                      </Badge>
                    </div>
                    <ChevronDown class="size-4 text-muted-foreground transition-transform" />
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <Separator />
                    <div class="divide-y divide-border">
                      <div v-for="(issue, i) in issues" :key="i" class="flex items-start gap-3 p-4">
                        <component
                          :is="severityConfig[issue.severity as keyof typeof severityConfig]?.icon ?? Info"
                          :class="cn('mt-0.5 size-4 shrink-0', severityConfig[issue.severity as keyof typeof severityConfig]?.color ?? 'text-muted-foreground')"
                        />
                        <div class="flex-1 min-w-0">
                          <div class="flex items-center gap-2 flex-wrap">
                            <Badge :variant="issue.severity === 'error' ? 'destructive' : 'secondary'" class="text-[10px] uppercase">
                              {{ issue.severity }}
                            </Badge>
                            <span v-if="issue.entry" class="font-mono text-xs text-muted-foreground">{{ issue.entry }}</span>
                            <span v-if="issue.field" class="font-mono text-xs text-muted-foreground">.{{ issue.field }}</span>
                            <Badge v-if="issue.locale" variant="outline" class="text-[10px]">{{ issue.locale }}</Badge>
                          </div>
                          <p class="mt-1.5 text-sm text-foreground">{{ issue.message }}</p>
                        </div>
                      </div>
                    </div>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            </div>
          </template>

          <!-- Severity-grouped view -->
          <template v-else>
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
                            <Button
                              v-if="issue.model"
                              variant="ghost"
                              size="sm"
                              class="h-auto font-mono text-xs text-primary hover:underline bg-muted px-1.5 py-0.5 rounded"
                              @click="router.push(`/content/${issue.model}`)"
                            >
                              {{ issue.model }}
                            </Button>
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
      </template>

      <StudioHint id="validate" message="Set up CI quality gates to catch issues automatically." class="mt-4" />
    </div>
  </div>
</template>

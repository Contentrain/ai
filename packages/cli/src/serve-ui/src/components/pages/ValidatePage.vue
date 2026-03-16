<script setup lang="ts">
import { onMounted, computed, ref, Transition } from 'vue'
import { useRouter } from 'vue-router'
import { dictionary } from '#contentrain'
import { useContentStore } from '@/stores/content'
import { useWatch } from '@/composables/useWatch'
import { toast } from 'vue-sonner'
import {
  ShieldCheck, ShieldAlert, AlertTriangle, CircleAlert, Info,
  ChevronDown, Filter, FileWarning, Database, ListChecks, Loader2,
} from 'lucide-vue-next'
import PageHeader from '@/components/layout/PageHeader.vue'
import StudioHint from '@/components/layout/StudioHint.vue'
import AgentPrompt from '@/components/layout/AgentPrompt.vue'
import AgentPromptGroup from '@/components/layout/AgentPromptGroup.vue'
import { Badge } from '@/components/ui/badge'
import { TrustBadge } from '@/components/ui/trust-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

const store = useContentStore()
const router = useRouter()
const t = dictionary('serve-ui-texts').locale('en').get()

const validation = computed(() => store.validation)
const summary = computed(() => validation.value?.summary)
const allIssues = computed(() => validation.value?.issues ?? [])

const showErrors = ref(true)
const showWarnings = ref(true)
const showNotices = ref(true)

const groupBy = ref<'severity' | 'model'>('severity')

const errorsOpen = ref(true)
const warningsOpen = ref(true)
const noticesOpen = ref(true)

const severityConfig = {
  error: { icon: CircleAlert, color: 'text-status-error', bg: 'bg-status-error/10', border: 'border-status-error/20', label: t['validate.errors'] },
  warning: { icon: AlertTriangle, color: 'text-status-warning', bg: 'bg-status-warning/10', border: 'border-status-warning/20', label: t['validate.warnings'] },
  notice: { icon: Info, color: 'text-status-info', bg: 'bg-status-info/10', border: 'border-status-info/20', label: t['validate.notices'] },
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

const issuesByModel = computed(() => {
  const groups = new Map<string, typeof allIssues.value>()
  for (const issue of allIssues.value) {
    const key = issue.model ?? 'unknown'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(issue)
  }
  return [...groups.entries()].toSorted((a, b) => b[1].length - a[1].length)
})

const lastUpdatedAt = ref<Date | null>(null)

async function fetchValidation() {
  try {
    await store.fetchValidation()
    lastUpdatedAt.value = new Date()
  } catch {
    toast.error('Failed to load validation results.')
  }
}

useWatch((event) => {
  if (event.type === 'validation:updated') {
    fetchValidation()
  }
})

onMounted(() => { fetchValidation() })
</script>

<template>
  <div>
    <PageHeader :title="t['validate.validation']" :description="t['validate.content-quality-report']">
      <template #actions>
        <TrustBadge
          :status="validation?.valid ? 'validated' : validation ? 'warning' : 'pending'"
          :count="(validation?.summary.errors ?? 0) + (validation?.summary.warnings ?? 0)"
        />
        <span v-if="lastUpdatedAt" class="text-xs text-muted-foreground tabular-nums">
          {{ t['validate.updated'] }} {{ lastUpdatedAt.toLocaleTimeString() }}
        </span>
      </template>
    </PageHeader>

    <div class="px-6 py-6 space-y-6">
      <div v-if="store.loading && !validation" class="flex justify-center py-12">
        <Loader2 class="size-6 animate-spin text-primary" />
      </div>

      <div v-if="store.loading && validation" class="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 class="size-4 animate-spin text-primary" />
        {{ t['validate.refreshing-validation'] }}
      </div>

      <template v-if="validation">
        <div class="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Card class="border-status-error/20">
            <CardContent class="flex items-center gap-3 p-4">
              <div class="flex size-10 items-center justify-center rounded-lg bg-status-error/10">
                <CircleAlert class="size-5 text-status-error" />
              </div>
              <div>
                <div class="text-2xl font-bold tabular-nums">{{ summary?.errors ?? 0 }}</div>
                <div class="text-xs text-muted-foreground">{{ t['validate.errors'] }}</div>
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
                <div class="text-xs text-muted-foreground">{{ t['validate.warnings'] }}</div>
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
                <div class="text-xs text-muted-foreground">{{ t['validate.notices'] }}</div>
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
                <div class="text-xs text-muted-foreground">{{ t['validate.models'] }}</div>
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
                <div class="text-xs text-muted-foreground">{{ t['validate.entries'] }}</div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div v-if="allIssues.length === 0" class="flex flex-col items-center py-16 text-center">
          <div class="flex size-20 items-center justify-center rounded-full bg-status-success/10 mb-4">
            <ShieldCheck class="size-10 text-status-success" />
          </div>
          <h2 class="text-xl font-semibold">{{ t['validate.all-checks-passed'] }}</h2>
          <p class="mt-2 text-sm text-muted-foreground max-w-sm">
            {{ t['validate.your-content-and-models'] }}
          </p>
          <div class="mt-6 w-full max-w-md">
            <AgentPromptGroup :title="t['validate.ask-your-agent']">
              <AgentPrompt :prompt="t['validate.validate-my-content-models']" label="re-validate" />
              <AgentPrompt :prompt="t['validate.check-content-quality-and']" :label="t['validate.quality-check']" />
            </AgentPromptGroup>
          </div>
        </div>

        <template v-else>
          <div class="flex items-center gap-2 flex-wrap">
            <Filter class="size-4 text-muted-foreground" />
            <div class="flex items-center border rounded-md overflow-hidden mr-2">
              <Button
                variant="ghost"
                size="sm"
                :class="cn('px-2.5 py-1 h-auto text-xs font-medium rounded-none transition-colors', groupBy === 'severity' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')"
                @click="groupBy = 'severity'"
              >
                {{ t['validate.by-severity'] }}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                :class="cn('px-2.5 py-1 h-auto text-xs font-medium rounded-none transition-colors', groupBy === 'model' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')"
                @click="groupBy = 'model'"
              >
                {{ t['validate.by-model'] }}
              </Button>
            </div>
            <Button
              :variant="showErrors ? 'default' : 'outline'"
              size="sm"
              class="h-7 text-xs"
              @click="showErrors = !showErrors"
            >
              <CircleAlert class="mr-1 size-3" />
              {{ t['validate.errors-2'] }}{{ errorIssues.length }})
            </Button>
            <Button
              :variant="showWarnings ? 'default' : 'outline'"
              size="sm"
              class="h-7 text-xs"
              @click="showWarnings = !showWarnings"
            >
              <AlertTriangle class="mr-1 size-3" />
              {{ t['validate.warnings-2'] }}{{ warningIssues.length }})
            </Button>
            <Button
              :variant="showNotices ? 'default' : 'outline'"
              size="sm"
              class="h-7 text-xs"
              @click="showNotices = !showNotices"
            >
              <Info class="mr-1 size-3" />
              {{ t['validate.notices-2'] }}{{ noticeIssues.length }})
            </Button>
          </div>

          <AgentPromptGroup :title="t['validate.ask-your-agent']">
            <AgentPrompt :prompt="t['validate.fix-all-validation-errors']" label="auto-fix" />
            <AgentPrompt :prompt="t['validate.review-and-fix-validation']" :label="t['validate.fix-warnings']" />
          </AgentPromptGroup>

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

          <template v-else>
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

            <div v-else class="flex flex-col items-center py-12 text-center">
              <FileWarning class="size-8 text-muted-foreground mb-3" />
              <p class="text-sm text-muted-foreground">{{ t['validate.all-issue-types-are'] }}</p>
            </div>
          </template>
        </template>
      </template>

      <StudioHint :message="t['validate.validation-results-update-automatically']" class="mt-4" />
    </div>
  </div>
</template>

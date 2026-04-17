<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { dictionary } from '#contentrain'
import {
  CheckCircle2, AlertTriangle, CircleAlert, Info, Stethoscope, Loader2, ChevronDown,
} from 'lucide-vue-next'
import PageHeader from '@/components/layout/PageHeader.vue'
import StudioHint from '@/components/layout/StudioHint.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { useProjectStore } from '@/stores/project'

const project = useProjectStore()
const t = dictionary('serve-ui-texts').locale('en').get()

const loading = ref(false)
const withUsage = ref(false)
const unusedOpen = ref(true)
const duplicatesOpen = ref(true)
const missingOpen = ref(true)

const report = computed(() => project.doctor)
const checks = computed(() => report.value?.checks ?? [])
const summary = computed(() => report.value?.summary)
const usage = computed(() => report.value?.usage)

const hasAnyFailure = computed(() => (summary.value?.failed ?? 0) > 0)
const hasWarnings = computed(() => (summary.value?.warnings ?? 0) > 0)

async function run() {
  loading.value = true
  try {
    await project.fetchDoctor({ usage: withUsage.value })
  } finally {
    loading.value = false
  }
}

function severityIcon(check: { pass: boolean, severity?: string }) {
  if (check.pass) return CheckCircle2
  if (check.severity === 'warning') return AlertTriangle
  return CircleAlert
}

function severityClass(check: { pass: boolean, severity?: string }) {
  if (check.pass) return 'text-status-success'
  if (check.severity === 'warning') return 'text-status-warning'
  return 'text-status-error'
}

onMounted(() => { run() })
</script>

<template>
  <div>
    <PageHeader :title="t['doctor.title']" :description="t['doctor.subtitle']">
      <template #actions>
        <Button :disabled="loading" size="sm" @click="run">
          <Loader2 v-if="loading" class="mr-1 size-4 animate-spin" />
          <Stethoscope v-else class="mr-1 size-4" />
          {{ t['dashboard.run'] }}
        </Button>
      </template>
    </PageHeader>

    <div class="px-6 py-6 space-y-6">
      <!-- Toolbar: usage toggle -->
      <Card>
        <CardContent class="flex items-center justify-between gap-4 p-4">
          <div class="text-sm">
            <div class="font-medium">{{ t['doctor.usage-toggle-label'] }}</div>
            <div class="text-muted-foreground text-xs">{{ t['doctor.usage-toggle-description'] }}</div>
          </div>
          <Button
            :variant="withUsage ? 'default' : 'outline'"
            size="sm"
            @click="withUsage = !withUsage"
          >
            {{ withUsage ? t['common.on'] : t['common.off'] }}
          </Button>
        </CardContent>
      </Card>

      <div v-if="loading && !report" class="flex justify-center py-12">
        <Loader2 class="size-6 animate-spin text-primary" />
      </div>

      <!-- Summary stat cards — mirrors ValidatePage layout -->
      <div v-if="summary" class="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card class="border-status-success/20">
          <CardContent class="flex items-center gap-3 p-4">
            <div class="flex size-10 items-center justify-center rounded-lg bg-status-success/10">
              <CheckCircle2 class="size-5 text-status-success" />
            </div>
            <div>
              <div class="text-2xl font-bold tabular-nums">{{ summary.passed }}</div>
              <div class="text-xs text-muted-foreground">{{ summary.total }} {{ t['dashboard.total'] }}</div>
            </div>
          </CardContent>
        </Card>

        <Card class="border-status-error/20">
          <CardContent class="flex items-center gap-3 p-4">
            <div class="flex size-10 items-center justify-center rounded-lg bg-status-error/10">
              <CircleAlert class="size-5 text-status-error" />
            </div>
            <div>
              <div class="text-2xl font-bold tabular-nums">{{ summary.failed }}</div>
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
              <div class="text-2xl font-bold tabular-nums">{{ summary.warnings }}</div>
              <div class="text-xs text-muted-foreground">{{ t['trust-badge.warnings'] }}</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent class="flex items-center gap-3 p-4">
            <div class="flex size-10 items-center justify-center rounded-lg bg-muted">
              <Info class="size-5 text-muted-foreground" />
            </div>
            <div class="text-xs">
              <div v-if="!hasAnyFailure" class="font-medium">{{ t['validate.all-checks-passed'] }}</div>
              <div v-else class="font-medium text-status-error">{{ summary.failed }} {{
                t['doctor.summary-failed-suffix'] }}
              </div>
              <div v-if="hasWarnings" class="text-muted-foreground">{{ t['doctor.summary-review-below'] }}</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <!-- Checks list -->
      <Card v-if="checks.length > 0">
        <div class="px-4 py-3 border-b border-border flex items-center gap-2">
          <span class="font-medium text-sm">{{ t['doctor.checks-title'] }}</span>
          <Badge variant="secondary" class="text-[10px]">{{ checks.length }}</Badge>
        </div>
        <div class="divide-y divide-border">
          <div v-for="(check, i) in checks" :key="`${check.name}-${i}`" class="flex items-start gap-3 p-4">
            <component :is="severityIcon(check)" :class="cn('mt-0.5 size-4 shrink-0', severityClass(check))" />
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="font-medium text-sm">{{ check.name }}</span>
                <Badge v-if="!check.pass && check.severity === 'warning'" variant="outline"
                  class="text-[10px] uppercase border-status-warning/50 text-status-warning">
                  {{ t['doctor.warning-label'] }}
                </Badge>
                <Badge v-if="!check.pass && (check.severity === 'error' || !check.severity)" variant="destructive"
                  class="text-[10px] uppercase">
                  {{ t['doctor.error-label'] }}
                </Badge>
              </div>
              <p class="mt-1.5 text-sm text-muted-foreground wrap-break-word">{{ check.detail }}</p>
            </div>
          </div>
        </div>
      </Card>

      <!-- Usage detail — unused keys -->
      <Collapsible v-if="usage && usage.unusedKeys.length > 0" v-model:open="unusedOpen">
        <Card>
          <CollapsibleTrigger
            class="flex w-full items-center justify-between p-4 hover:bg-muted/50 transition-colors rounded-t-lg">
            <div class="flex items-center gap-3">
              <div class="flex size-8 items-center justify-center rounded-md bg-status-warning/10">
                <AlertTriangle class="size-4 text-status-warning" />
              </div>
              <span class="font-medium text-sm">{{ t['doctor.unused-keys-title'] }}</span>
              <Badge variant="secondary" class="text-[10px]">{{ usage.unusedKeys.length }}</Badge>
            </div>
            <ChevronDown class="size-4 text-muted-foreground transition-transform"
              :class="unusedOpen && 'rotate-180'" />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <Separator />
            <div class="divide-y divide-border">
              <div v-for="k in usage.unusedKeys.slice(0, 50)" :key="`${k.model}-${k.key}-${k.locale}`"
                class="flex items-center gap-3 p-3 text-xs font-mono">
                <span class="text-muted-foreground shrink-0">{{ k.model }}</span>
                <span class="truncate">{{ k.key }}</span>
                <Badge variant="outline" class="text-[10px] ml-auto">{{ k.locale }}</Badge>
              </div>
              <div v-if="usage.unusedKeys.length > 50" class="p-3 text-xs text-muted-foreground italic">
                … {{ t['doctor.and-more'] }} ({{ usage.unusedKeys.length - 50 }})
              </div>
            </div>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      <!-- Usage detail — duplicate values -->
      <Collapsible v-if="usage && usage.duplicateValues.length > 0" v-model:open="duplicatesOpen">
        <Card>
          <CollapsibleTrigger
            class="flex w-full items-center justify-between p-4 hover:bg-muted/50 transition-colors rounded-t-lg">
            <div class="flex items-center gap-3">
              <div class="flex size-8 items-center justify-center rounded-md bg-status-warning/10">
                <AlertTriangle class="size-4 text-status-warning" />
              </div>
              <span class="font-medium text-sm">{{ t['doctor.duplicate-values-title'] }}</span>
              <Badge variant="secondary" class="text-[10px]">{{ usage.duplicateValues.length }}</Badge>
            </div>
            <ChevronDown class="size-4 text-muted-foreground transition-transform"
              :class="duplicatesOpen && 'rotate-180'" />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <Separator />
            <div class="divide-y divide-border">
              <div v-for="(dv, i) in usage.duplicateValues.slice(0, 20)" :key="`${dv.model}-${dv.locale}-${i}`"
                class="p-3 text-xs">
                <div class="flex items-center gap-2 font-mono">
                  <span class="text-muted-foreground">{{ dv.model }}/{{ dv.locale }}</span>
                  <span class="truncate italic">"{{ dv.value }}"</span>
                </div>
                <div class="pl-4 text-muted-foreground mt-1">→ {{ dv.keys.join(', ') }}</div>
              </div>
              <div v-if="usage.duplicateValues.length > 20" class="p-3 text-xs text-muted-foreground italic">
                … {{ t['doctor.and-more'] }} ({{ usage.duplicateValues.length - 20 }})
              </div>
            </div>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      <!-- Usage detail — missing locale keys -->
      <Collapsible v-if="usage && usage.missingLocaleKeys.length > 0" v-model:open="missingOpen">
        <Card>
          <CollapsibleTrigger
            class="flex w-full items-center justify-between p-4 hover:bg-muted/50 transition-colors rounded-t-lg">
            <div class="flex items-center gap-3">
              <div class="flex size-8 items-center justify-center rounded-md bg-status-warning/10">
                <AlertTriangle class="size-4 text-status-warning" />
              </div>
              <span class="font-medium text-sm">{{ t['doctor.missing-locale-title'] }}</span>
              <Badge variant="secondary" class="text-[10px]">{{ usage.missingLocaleKeys.length }}</Badge>
            </div>
            <ChevronDown class="size-4 text-muted-foreground transition-transform"
              :class="missingOpen && 'rotate-180'" />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <Separator />
            <div class="divide-y divide-border">
              <div v-for="m in usage.missingLocaleKeys.slice(0, 50)" :key="`${m.model}-${m.key}-${m.missingIn}`"
                class="flex items-center gap-3 p-3 text-xs font-mono">
                <span class="text-muted-foreground shrink-0">{{ m.model }}</span>
                <span class="truncate">{{ m.key }}</span>
                <span class="text-muted-foreground ml-auto">{{ t['doctor.missing-in'] }} {{ m.missingIn }}</span>
              </div>
              <div v-if="usage.missingLocaleKeys.length > 50" class="p-3 text-xs text-muted-foreground italic">
                … {{ t['doctor.and-more'] }} ({{ usage.missingLocaleKeys.length - 50 }})
              </div>
            </div>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      <!-- Empty state -->
      <div v-if="!loading && !report" class="flex flex-col items-center py-16 text-center">
        <div class="flex size-20 items-center justify-center rounded-full bg-muted mb-4">
          <Stethoscope class="size-10 text-muted-foreground" />
        </div>
        <h2 class="text-xl font-semibold">{{ t['doctor.empty-title'] }}</h2>
        <p class="mt-2 text-sm text-muted-foreground max-w-sm">{{ t['doctor.empty-cta'] }}</p>
      </div>

      <StudioHint :message="t['validate.validation-results-update-automatically']" class="mt-4" />
    </div>
  </div>
</template>

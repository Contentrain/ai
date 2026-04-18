<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { dictionary } from '#contentrain'
import { Loader2, FileCode, Info, ChevronDown } from 'lucide-vue-next'
import PageHeader from '@/components/layout/PageHeader.vue'
import StudioHint from '@/components/layout/StudioHint.vue'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Separator } from '@/components/ui/separator'
import { useProjectStore } from '@/stores/project'

const project = useProjectStore()
const t = dictionary('serve-ui-texts').locale('en').get()

interface FormatSection {
  key: string
  label: string
  value: unknown
}

function humanize(key: string): string {
  return key.replace(/_/g, ' ').replace(/(^|\s)\w/g, c => c.toUpperCase())
}

const sections = computed<FormatSection[]>(() => {
  const raw = project.formatReference
  if (!raw || typeof raw !== 'object') return []
  return Object.entries(raw).map(([key, value]) => ({
    key,
    label: humanize(key),
    value,
  }))
})

function renderValue(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'string') return value
  return JSON.stringify(value, null, 2)
}

function isObjectLike(value: unknown): boolean {
  return typeof value === 'object' && value !== null
}

function childEntries(value: unknown): Array<[string, unknown]> {
  if (!isObjectLike(value)) return []
  return Object.entries(value as Record<string, unknown>)
}

onMounted(() => {
  if (!project.formatReference) project.fetchFormatReference()
})
</script>

<template>
  <div>
    <PageHeader :title="t['format.title']" :description="t['format.subtitle']" />

    <div class="px-6 py-6 space-y-4">
      <div v-if="!project.formatReference"
        class="flex items-center justify-center py-12 gap-2 text-sm text-muted-foreground">
        <Loader2 class="size-4 animate-spin" />
        {{ t['format.loading'] }}
      </div>

      <template v-else-if="sections.length === 0">
        <Card class="p-6 flex items-center gap-3 text-sm text-muted-foreground">
          <Info class="size-4 shrink-0" />
          {{ t['format.empty'] }}
        </Card>
      </template>

      <template v-else>
        <Collapsible v-for="section in sections" :key="section.key" :default-open="true">
          <Card>
            <CollapsibleTrigger
              class="flex w-full items-center justify-between p-4 hover:bg-muted/50 transition-colors rounded-t-lg">
              <div class="flex items-center gap-3">
                <div class="flex size-8 items-center justify-center rounded-md bg-primary/10">
                  <FileCode class="size-4 text-primary" />
                </div>
                <span class="font-medium text-sm">{{ section.label }}</span>
                <Badge v-if="isObjectLike(section.value)" variant="secondary" class="text-[10px]">
                  {{ childEntries(section.value).length }}
                </Badge>
              </div>
              <ChevronDown class="size-4 text-muted-foreground transition-transform" />
            </CollapsibleTrigger>

            <CollapsibleContent>
              <Separator />
              <div class="p-4 text-sm">
                <!-- Flat string value — render inline. -->
                <p v-if="typeof section.value === 'string'" class="text-muted-foreground whitespace-pre-wrap">
                  {{ section.value }}
                </p>

                <!-- Object — render each child as a labelled row. -->
                <div v-else-if="isObjectLike(section.value)" class="divide-y divide-border/50">
                  <div v-for="[childKey, childValue] in childEntries(section.value)" :key="childKey"
                    class="py-2 first:pt-0 last:pb-0">
                    <div class="text-xs font-mono text-muted-foreground mb-1">{{ childKey }}</div>
                    <pre
                      class="bg-muted rounded p-2 text-xs overflow-x-auto whitespace-pre-wrap wrap-break-word">{{ renderValue(childValue) }}</pre>
                  </div>
                </div>

                <!-- Fallback — any other scalar. -->
                <span v-else class="text-muted-foreground">{{ renderValue(section.value) }}</span>
              </div>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      </template>

      <StudioHint :message="t['validate.validation-results-update-automatically']" class="mt-4" />
    </div>
  </div>
</template>

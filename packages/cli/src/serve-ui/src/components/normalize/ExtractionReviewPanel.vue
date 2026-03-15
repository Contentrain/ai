<script setup lang="ts">
import { computed } from 'vue'
import type { NormalizePlanExtraction, NormalizePlanModel } from '@/stores/content'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import {
  ChevronDown, FileCode, ArrowRight, Layers,
  BookOpen, BookMarked, MapPin,
} from 'lucide-vue-next'

const props = defineProps<{
  models: NormalizePlanModel[]
  extractions: NormalizePlanExtraction[]
  selectedModels: Set<string>
}>()

const emit = defineEmits<{
  (e: 'select-extraction', extraction: NormalizePlanExtraction): void
}>()

const kindConfig: Record<string, { icon: typeof Layers; color: string; bg: string }> = {
  collection: { icon: Layers, color: 'text-blue-500', bg: 'bg-blue-500/10' },
  singleton: { icon: FileCode, color: 'text-teal-500', bg: 'bg-teal-500/10' },
  document: { icon: BookOpen, color: 'text-green-500', bg: 'bg-green-500/10' },
  dictionary: { icon: BookMarked, color: 'text-amber-500', bg: 'bg-amber-500/10' },
}

function getKindConfig(kind: string) {
  return kindConfig[kind] ?? kindConfig['collection']
}

const extractionsByModel = computed(() => {
  const groups = new Map<string, NormalizePlanExtraction[]>()
  for (const ext of props.extractions) {
    if (!groups.has(ext.model)) groups.set(ext.model, [])
    groups.get(ext.model)!.push(ext)
  }
  return [...groups.entries()].toSorted((a, b) => b[1].length - a[1].length)
})

function getModelDef(modelId: string) {
  return props.models.find(m => m.id === modelId)
}

function isSelected(modelId: string) {
  return props.selectedModels.has(modelId)
}
</script>

<template>
  <div class="space-y-4">
    <Collapsible
      v-for="[modelId, exts] in extractionsByModel"
      :key="modelId"
      :default-open="extractionsByModel.length <= 5"
    >
      <Card :class="cn(!isSelected(modelId) && 'opacity-50')">
        <CollapsibleTrigger class="flex w-full items-center justify-between p-4 hover:bg-muted/50 transition-colors rounded-t-lg">
          <div class="flex items-center gap-3">
            <div :class="cn('flex size-8 items-center justify-center rounded-md', getKindConfig(getModelDef(modelId)?.kind ?? 'collection').bg)">
              <component :is="getKindConfig(getModelDef(modelId)?.kind ?? 'collection').icon"
                :class="cn('size-4', getKindConfig(getModelDef(modelId)?.kind ?? 'collection').color)" />
            </div>
            <span class="font-medium text-sm font-mono">{{ modelId }}</span>
            <Badge variant="secondary" class="text-[10px]">{{ exts.length }} strings</Badge>
            <Badge v-if="getModelDef(modelId)?.domain" variant="outline" class="text-[10px]">
              {{ getModelDef(modelId)?.domain }}
            </Badge>
          </div>
          <ChevronDown class="size-4 text-muted-foreground transition-transform" />
        </CollapsibleTrigger>

        <CollapsibleContent>
          <Separator />
          <div class="divide-y divide-border">
            <button
              v-for="(ext, i) in exts"
              :key="i"
              class="flex w-full items-start gap-3 p-4 text-left hover:bg-muted/30 transition-colors"
              @click="emit('select-extraction', ext)"
            >
              <MapPin class="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium text-foreground truncate">"{{ ext.value }}"</p>
                <div class="flex items-center gap-2 mt-1 flex-wrap">
                  <span class="font-mono text-xs text-muted-foreground">{{ ext.file }}</span>
                  <Badge variant="outline" class="text-[10px]">L{{ ext.line }}</Badge>
                  <ArrowRight class="size-3 text-muted-foreground" />
                  <span class="font-mono text-xs text-primary">{{ ext.model }}.{{ ext.field }}</span>
                  <Badge v-if="ext.locale" variant="secondary" class="text-[10px]">{{ ext.locale }}</Badge>
                </div>
              </div>
            </button>
          </div>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  </div>
</template>

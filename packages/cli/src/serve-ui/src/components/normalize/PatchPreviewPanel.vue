<script setup lang="ts">
import { computed } from 'vue'
import type { NormalizePlanPatch } from '@/stores/content'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Separator } from '@/components/ui/separator'
import { ChevronDown, FileCode, Minus, Plus } from 'lucide-vue-next'

const props = defineProps<{
  patches: NormalizePlanPatch[]
}>()

const patchesByFile = computed(() => {
  const groups = new Map<string, NormalizePlanPatch[]>()
  for (const patch of props.patches) {
    if (!groups.has(patch.file)) groups.set(patch.file, [])
    groups.get(patch.file)!.push(patch)
  }
  return [...groups.entries()].toSorted((a, b) => b[1].length - a[1].length)
})
</script>

<template>
  <div class="space-y-3">
    <Collapsible
      v-for="[file, filePatches] in patchesByFile"
      :key="file"
      :default-open="patchesByFile.length <= 5"
    >
      <Card>
        <CollapsibleTrigger class="flex w-full items-center justify-between p-3 hover:bg-muted/50 transition-colors rounded-t-lg">
          <div class="flex items-center gap-2">
            <FileCode class="size-4 text-muted-foreground" />
            <span class="font-mono text-xs text-foreground">{{ file }}</span>
            <Badge variant="secondary" class="text-[10px]">{{ filePatches.length }}</Badge>
          </div>
          <ChevronDown class="size-4 text-muted-foreground transition-transform" />
        </CollapsibleTrigger>

        <CollapsibleContent>
          <Separator />
          <div class="divide-y divide-border">
            <div v-for="(patch, i) in filePatches" :key="i" class="p-3">
              <div class="flex items-center gap-2 mb-2">
                <Badge variant="outline" class="text-[10px]">L{{ patch.line }}</Badge>
              </div>
              <div class="rounded-md border overflow-hidden font-mono text-xs">
                <div class="flex items-start gap-2 px-3 py-1.5 bg-red-500/5">
                  <Minus class="mt-0.5 size-3 shrink-0 text-red-500" />
                  <span class="text-red-600 dark:text-red-400 line-through whitespace-pre-wrap break-all">{{ patch.old_value }}</span>
                </div>
                <div class="flex items-start gap-2 px-3 py-1.5 bg-green-500/5">
                  <Plus class="mt-0.5 size-3 shrink-0 text-green-500" />
                  <span class="text-green-600 dark:text-green-400 whitespace-pre-wrap break-all">{{ patch.new_expression }}</span>
                </div>
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  </div>
</template>

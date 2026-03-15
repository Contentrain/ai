<script setup lang="ts">
import { ref, watch } from 'vue'
import { useApi } from '@/composables/useApi'
import type { NormalizePlanExtraction, NormalizePlanPatch } from '@/stores/content'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import {
  FileCode, ArrowDown, Database, ArrowRight,
  Code, X, Loader2,
} from 'lucide-vue-next'

interface FileContextLine {
  num: number
  content: string
}

const props = defineProps<{
  extraction: NormalizePlanExtraction | null
  patches: NormalizePlanPatch[]
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const api = useApi()
const fileLines = ref<FileContextLine[]>([])
const highlightLine = ref(0)
const loading = ref(false)

// Find matching patch for this extraction
function findPatch() {
  if (!props.extraction) return null
  return props.patches.find(p =>
    p.file === props.extraction!.file &&
    p.line === props.extraction!.line
  )
}

// Load file context when extraction changes
watch(() => props.extraction, async (ext) => {
  if (!ext) {
    fileLines.value = []
    return
  }
  loading.value = true
  try {
    const result = await api.get<{
      file: string
      lines: FileContextLine[]
      highlight: number
    }>(`/normalize/file-context?file=${encodeURIComponent(ext.file)}&line=${ext.line}&range=4`)
    fileLines.value = result.lines
    highlightLine.value = result.highlight
  } catch {
    fileLines.value = []
  } finally {
    loading.value = false
  }
}, { immediate: true })
</script>

<template>
  <Card v-if="extraction" class="border-primary/20">
    <CardHeader class="pb-3">
      <div class="flex items-center justify-between">
        <CardTitle class="text-sm">Source Trace</CardTitle>
        <button class="rounded-md p-1 hover:bg-muted transition-colors" @click="emit('close')">
          <X class="size-4 text-muted-foreground" />
        </button>
      </div>
    </CardHeader>

    <CardContent class="space-y-4">
      <!-- Step 1: Source file context -->
      <div>
        <div class="flex items-center gap-2 mb-2">
          <div class="flex size-6 items-center justify-center rounded bg-blue-500/10">
            <FileCode class="size-3.5 text-blue-500" />
          </div>
          <span class="text-xs font-medium text-foreground">Source File</span>
          <span class="font-mono text-xs text-muted-foreground">{{ extraction.file }}:{{ extraction.line }}</span>
        </div>

        <div v-if="loading" class="flex items-center justify-center py-4">
          <Loader2 class="size-4 animate-spin text-muted-foreground" />
        </div>
        <div v-else-if="fileLines.length > 0" class="rounded-md border bg-muted/30 overflow-hidden font-mono text-xs">
          <div
            v-for="line in fileLines"
            :key="line.num"
            :class="cn(
              'flex gap-3 px-3 py-0.5',
              line.num === highlightLine && 'bg-primary/10 border-l-2 border-primary'
            )"
          >
            <span class="w-8 shrink-0 text-right text-muted-foreground/50 select-none">{{ line.num }}</span>
            <span class="whitespace-pre overflow-x-auto" :class="line.num === highlightLine && 'text-foreground font-medium'">{{ line.content }}</span>
          </div>
        </div>
      </div>

      <!-- Arrow -->
      <div class="flex justify-center">
        <ArrowDown class="size-5 text-muted-foreground" />
      </div>

      <!-- Step 2: Model Entry -->
      <div>
        <div class="flex items-center gap-2 mb-2">
          <div class="flex size-6 items-center justify-center rounded bg-emerald-500/10">
            <Database class="size-3.5 text-emerald-500" />
          </div>
          <span class="text-xs font-medium text-foreground">Content Entry</span>
        </div>
        <div class="rounded-md border bg-muted/30 p-3">
          <div class="flex items-center gap-2 flex-wrap">
            <Badge variant="secondary" class="font-mono text-[10px]">{{ extraction.model }}</Badge>
            <ArrowRight class="size-3 text-muted-foreground" />
            <span class="font-mono text-xs text-primary">{{ extraction.field }}</span>
            <span class="text-xs text-muted-foreground">=</span>
            <span class="text-xs text-foreground">"{{ extraction.value }}"</span>
            <Badge v-if="extraction.locale" variant="outline" class="text-[10px]">{{ extraction.locale }}</Badge>
          </div>
        </div>
      </div>

      <!-- Step 3: Reuse Patch (if exists) -->
      <template v-if="findPatch()">
        <div class="flex justify-center">
          <ArrowDown class="size-5 text-muted-foreground" />
        </div>
        <div>
          <div class="flex items-center gap-2 mb-2">
            <div class="flex size-6 items-center justify-center rounded bg-violet-500/10">
              <Code class="size-3.5 text-violet-500" />
            </div>
            <span class="text-xs font-medium text-foreground">Reuse Patch</span>
          </div>
          <div class="rounded-md border overflow-hidden font-mono text-xs">
            <div class="flex gap-3 px-3 py-1.5 bg-red-500/5 text-red-600 dark:text-red-400 line-through">
              <span class="w-6 shrink-0 text-right select-none">-</span>
              <span>{{ findPatch()!.old_value }}</span>
            </div>
            <div class="flex gap-3 px-3 py-1.5 bg-green-500/5 text-green-600 dark:text-green-400">
              <span class="w-6 shrink-0 text-right select-none">+</span>
              <span>{{ findPatch()!.new_expression }}</span>
            </div>
          </div>
        </div>
      </template>
    </CardContent>
  </Card>
</template>

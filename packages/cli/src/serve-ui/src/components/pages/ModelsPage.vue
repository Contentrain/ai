<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useProjectStore } from '@/stores/project'
import { Box, FileCode, FileText, BookOpen, Hash } from 'lucide-vue-next'
import PageHeader from '@/components/layout/PageHeader.vue'
import StudioHint from '@/components/layout/StudioHint.vue'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const project = useProjectStore()
const router = useRouter()

const models = computed(() => project.status?.models ?? [])

const kindIcons: Record<string, typeof Box> = {
  collection: Box,
  singleton: FileText,
  document: FileCode,
  dictionary: BookOpen,
}

const kindColors: Record<string, string> = {
  collection: 'bg-primary/10 text-primary',
  singleton: 'bg-status-info/10 text-status-info',
  document: 'bg-status-success/10 text-status-success',
  dictionary: 'bg-status-warning/10 text-status-warning',
}
</script>

<template>
  <div>
    <PageHeader title="Models" description="Content model definitions" />

    <div class="px-6 py-6">
      <div v-if="models.length === 0" class="flex flex-col items-center py-16 text-center">
        <img src="/model-empty-state.svg" alt="" class="mb-6 h-32 opacity-50 dark:opacity-30" />
        <h2 class="text-lg font-semibold">No models yet</h2>
        <p class="mt-2 max-w-sm text-sm text-muted-foreground">
          Create content models using AI in your IDE, then come back to inspect them here.
        </p>
      </div>

      <div v-else class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        <button
          v-for="model in models"
          :key="model.id"
          class="group flex items-start gap-4 rounded-lg border border-border bg-card p-4 text-left transition-all hover:border-primary/30 hover:shadow-sm"
          @click="router.push(`/models/${model.id}`)"
        >
          <div :class="cn('flex size-10 shrink-0 items-center justify-center rounded-lg', kindColors[model.kind] ?? 'bg-muted text-muted-foreground')">
            <component :is="kindIcons[model.kind] ?? Hash" class="size-5" />
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <span class="font-medium text-foreground group-hover:text-primary transition-colors">{{ model.id }}</span>
              <Badge variant="secondary" class="text-[10px]">{{ model.kind }}</Badge>
            </div>
            <div class="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
              <span>{{ model.fields }} fields</span>
              <span>{{ model.domain }}</span>
              <span v-if="model.i18n" class="text-status-info">i18n</span>
            </div>
          </div>
        </button>
      </div>

      <StudioHint id="models" message="Create and manage models with AI chat in Contentrain Studio." class="mt-8" />
    </div>
  </div>
</template>

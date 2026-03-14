<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useProjectStore } from '@/stores/project'
import { FileText } from 'lucide-vue-next'
import PageHeader from '@/components/layout/PageHeader.vue'
import { Badge } from '@/components/ui/badge'

const project = useProjectStore()
const router = useRouter()

const models = computed(() => project.status?.models ?? [])
</script>

<template>
  <div>
    <PageHeader title="Content" description="Browse content by collection" />

    <div class="px-6 py-6">
      <div v-if="models.length === 0" class="flex flex-col items-center py-16 text-center">
        <img src="/empty-state-manual.svg" alt="" class="mb-6 h-28 opacity-50 dark:opacity-30" />
        <h2 class="text-lg font-semibold">No content yet</h2>
        <p class="mt-2 text-sm text-muted-foreground">Create models first, then content will appear here.</p>
      </div>

      <div v-else class="space-y-2">
        <button
          v-for="model in models"
          :key="model.id"
          class="flex w-full items-center gap-3 rounded-lg border border-border bg-card p-4 text-left transition-all hover:border-primary/30 hover:shadow-sm"
          @click="router.push(`/content/${model.id}`)"
        >
          <div class="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
            <FileText class="size-4" />
          </div>
          <div class="flex-1 min-w-0">
            <span class="font-medium text-foreground">{{ model.id }}</span>
            <span class="ml-2 text-xs text-muted-foreground">{{ model.domain }}</span>
          </div>
          <Badge variant="secondary">{{ model.fields }} fields</Badge>
          <Badge v-if="model.i18n" variant="outline" class="text-status-info border-status-info/30">i18n</Badge>
        </button>
      </div>
    </div>
  </div>
</template>

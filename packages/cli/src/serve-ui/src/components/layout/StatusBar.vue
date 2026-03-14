<script setup lang="ts">
import { computed } from 'vue'
import { useProjectStore } from '@/stores/project'
import { useWatch } from '@/composables/useWatch'

const project = useProjectStore()
const { connected, lastUpdate } = useWatch()

const modelCount = computed(() => project.status?.models.length ?? 0)
const localeCount = computed(() => project.status?.config?.locales.supported.length ?? 0)
const entryCount = computed(() => {
  const ctx = project.status?.context
  if (!ctx?.stats) return 0
  const stats = ctx.stats as Record<string, unknown>
  return typeof stats['total_entries'] === 'number' ? stats['total_entries'] : 0
})

const lastUpdateText = computed(() => {
  if (!lastUpdate.value) return ''
  const diff = Date.now() - lastUpdate.value.getTime()
  if (diff < 5000) return 'just now'
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  return lastUpdate.value.toLocaleTimeString()
})
</script>

<template>
  <footer class="flex items-center gap-4 border-t border-border bg-background px-6 py-1.5 text-xs text-muted-foreground">
    <span class="flex items-center gap-1.5">
      <span
        class="size-1.5 rounded-full"
        :class="connected ? 'bg-status-success' : 'bg-status-error'"
      />
      {{ connected ? 'watching' : 'disconnected' }}
    </span>
    <span class="h-3 w-px bg-border" />
    <span>{{ modelCount }} models</span>
    <span class="h-3 w-px bg-border" />
    <span>{{ localeCount }} locales</span>
    <span v-if="lastUpdateText" class="ml-auto">{{ lastUpdateText }}</span>
  </footer>
</template>

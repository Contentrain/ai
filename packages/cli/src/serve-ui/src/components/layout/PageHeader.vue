<script setup lang="ts">
import { ExternalLink } from 'lucide-vue-next'
import { useWatch } from '@/composables/useWatch'

defineProps<{
  title: string
  description?: string
}>()

const { connected } = useWatch()
</script>

<template>
  <header class="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur">
    <div class="flex items-center justify-between px-6 py-4">
      <div class="min-w-0">
        <h1 class="text-lg font-semibold text-foreground truncate">{{ title }}</h1>
        <p v-if="description" class="text-sm text-muted-foreground truncate">{{ description }}</p>
      </div>

      <div class="flex items-center gap-3 shrink-0">
        <!-- Watching indicator -->
        <div class="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
          <span
            class="size-1.5 rounded-full"
            :class="connected ? 'bg-status-success animate-pulse' : 'bg-status-error'"
          />
          {{ connected ? 'watching' : 'disconnected' }}
        </div>

        <!-- Actions slot -->
        <slot name="actions" />

        <!-- Studio link -->
        <a
          href="https://studio.contentrain.io"
          target="_blank"
          rel="noopener"
          class="hidden items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground sm:flex"
        >
          Open in Studio
          <ExternalLink class="size-3" />
        </a>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { ExternalLink, Sparkles } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { useWatch } from '@/composables/useWatch'
import { dictionary } from '#contentrain'

const t = dictionary('serve-ui-texts').locale('en').get()

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

        <!-- Studio CTA -->
        <Button
          as="a"
          href="https://studio.contentrain.io"
          target="_blank"
          rel="noopener"
          size="sm"
          class="hidden sm:inline-flex bg-linear-to-r from-primary to-primary/80 shadow-sm hover:shadow-md hover:from-primary/90 hover:to-primary/70"
        >
          <Sparkles class="size-3.5" />
          {{ t['header.open-in-studio'] }}
          <ExternalLink class="size-3 opacity-60" />
        </Button>
      </div>
    </div>
  </header>
</template>

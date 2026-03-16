<script setup lang="ts">
import { Bot } from 'lucide-vue-next'

defineProps<{
  title?: string
}>()
</script>

<template>
  <div class="space-y-2">
    <div v-if="title" class="flex items-center gap-2 text-xs font-medium text-muted-foreground">
      <Bot class="size-3.5" />
      <span>{{ title }}</span>
    </div>
    <div class="grid gap-1.5">
      <slot />
    </div>
  </div>
</template>

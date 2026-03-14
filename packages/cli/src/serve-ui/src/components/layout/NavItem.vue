<script setup lang="ts">
import { RouterLink } from 'vue-router'
import type { Component } from 'vue'
import { cn } from '@/lib/utils'

defineProps<{
  icon: Component
  label: string
  to: string
  active?: boolean
}>()
</script>

<template>
  <RouterLink
    :to="to"
    :class="cn(
      'group flex size-10 items-center justify-center rounded-lg transition-colors',
      active
        ? 'bg-primary/10 text-primary'
        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
    )"
    :title="label"
  >
    <component :is="icon" class="size-5" />
  </RouterLink>
</template>

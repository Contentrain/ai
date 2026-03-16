<script setup lang="ts">
import { ArrowRight } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'

defineProps<{
  message: string
}>()
</script>

<template>
  <div class="relative overflow-hidden rounded-xl border border-primary/15">
    <!-- Background pattern -->
    <div class="absolute inset-0 bg-gradient-to-r from-primary/8 via-primary/4 to-primary/8" />
    <img
      src="/for-developers-1.svg"
      alt=""
      class="absolute inset-0 size-full object-cover opacity-[0.04] dark:opacity-[0.08] pointer-events-none select-none"
    />

    <!-- Content -->
    <div class="relative flex items-center gap-5 px-6 py-6">
      <!-- Message -->
      <p class="flex-1 text-sm text-muted-foreground leading-relaxed">
        {{ message }}
      </p>

      <!-- CTA -->
      <Button
        as="a"
        href="https://studio.contentrain.io"
        target="_blank"
        rel="noopener"
        size="sm"
      >
        Open Studio
        <ArrowRight class="size-3.5" />
      </Button>
    </div>
  </div>
</template>

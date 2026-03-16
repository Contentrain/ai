<script setup lang="ts">
import { ref } from 'vue'
import { Bot, Copy, Check } from 'lucide-vue-next'
import { toast } from 'vue-sonner'

const props = defineProps<{
  prompt: string
  label?: string
}>()

const copied = ref(false)

async function copyPrompt() {
  try {
    await navigator.clipboard.writeText(props.prompt)
    copied.value = true
    toast.success('Prompt copied — paste it in your AI agent')
    setTimeout(() => { copied.value = false }, 2000)
  } catch {
    toast.error('Failed to copy prompt')
  }
}
</script>

<template>
  <button
    class="group flex w-full items-start gap-3 rounded-lg border border-border/60 bg-card px-3.5 py-2.5 text-left transition-all hover:border-primary/30 hover:bg-primary/[0.03] active:scale-[0.995]"
    @click="copyPrompt"
  >
    <div class="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary transition-colors group-hover:bg-primary/15">
      <Bot class="size-3.5" />
    </div>
    <div class="flex-1 min-w-0">
      <span v-if="label" class="block text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60 mb-0.5">{{ label }}</span>
      <span class="block text-xs text-foreground/80 leading-relaxed">{{ prompt }}</span>
    </div>
    <div class="shrink-0 mt-0.5 text-muted-foreground/40 transition-colors group-hover:text-primary/60">
      <Check v-if="copied" class="size-3.5 text-status-success" />
      <Copy v-else class="size-3.5" />
    </div>
  </button>
</template>

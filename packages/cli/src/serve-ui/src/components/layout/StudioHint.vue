<script setup lang="ts">
import { computed } from 'vue'
import { X, ExternalLink } from 'lucide-vue-next'
import { useUiStore } from '@/stores/ui'

const props = defineProps<{
  id: string
  message: string
}>()

const ui = useUiStore()
const visible = computed(() => !ui.isHintDismissed(props.id))
</script>

<template>
  <div v-if="visible"
    class="flex items-center justify-between gap-3 rounded-lg border border-status-info/20 bg-linear-to-b from-status-info/5 to-transparent px-4 py-3">
    <p class="text-sm text-muted-foreground">
      {{ message }}
      <a href="https://studio.contentrain.io" target="_blank" rel="noopener"
        class="ml-1 inline-flex items-center gap-1 font-medium text-primary hover:underline">
        Open Studio
        <ExternalLink class="size-3" />
      </a>
    </p>
    <button class="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent" @click="ui.dismissHint(id)">
      <X class="size-3.5" />
    </button>
  </div>
</template>

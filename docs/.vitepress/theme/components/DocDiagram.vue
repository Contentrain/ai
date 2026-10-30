<script setup lang="ts">
import { computed } from 'vue'

// Diagrams are inlined rather than loaded with <img>, so their ink follows the
// light/dark theme through the VitePress CSS variables they reference.
const svgs = import.meta.glob('../../../public/diagrams/*.svg', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

const props = defineProps<{ name: string }>()

const svg = computed(() => svgs[`../../../public/diagrams/${props.name}.svg`] ?? '')
</script>

<template>
  <figure class="doc-diagram" v-html="svg" />
</template>

<style scoped>
.doc-diagram {
  margin: 24px 0;
}

.doc-diagram :deep(svg) {
  display: block;
  width: 100%;
  max-width: 680px;
  height: auto;
}
</style>

<script setup lang="ts">
// VitePress 1.6.4 VPHomeContent, with --vp-offset applied only after mount.
// The original reads the window width during hydration, so the client style
// differs from the server-rendered one and Vue logs a hydration mismatch.
import { onMounted, onUnmounted, ref } from 'vue'

const vw = ref(0)
const update = () => { vw.value = document.documentElement.clientWidth }

onMounted(() => {
  update()
  window.addEventListener('resize', update, { passive: true })
})
onUnmounted(() => window.removeEventListener('resize', update))
</script>

<template>
  <div
    class="vp-doc container"
    :style="vw ? { '--vp-offset': `calc(50% - ${vw / 2}px)` } : {}"
  >
    <slot />
  </div>
</template>

<style scoped>
.container {
  margin: auto;
  width: 100%;
  max-width: 1280px;
  padding: 0 24px;
}

@media (min-width: 640px) {
  .container {
    padding: 0 48px;
  }
}

@media (min-width: 960px) {
  .container {
    width: 100%;
    padding: 0 64px;
  }
}

.vp-doc :deep(.VPHomeSponsors),
.vp-doc :deep(.VPTeamPage) {
  margin-left: var(--vp-offset, calc(50% - 50vw));
  margin-right: var(--vp-offset, calc(50% - 50vw));
}

.vp-doc :deep(.VPHomeSponsors h2) {
  border-top: none;
  letter-spacing: normal;
}

.vp-doc :deep(.VPHomeSponsors a),
.vp-doc :deep(.VPTeamPage a) {
  text-decoration: none;
}
</style>

<script setup lang="ts">
import { RouterView } from 'vue-router'
import PrimarySidebar from './PrimarySidebar.vue'
import StatusBar from './StatusBar.vue'
import MobileNav from './MobileNav.vue'
import { useProjectStore } from '@/stores/project'
import { useWatch } from '@/composables/useWatch'
import { onMounted } from 'vue'

const project = useProjectStore()

useWatch((event) => {
  if (event.type === 'config:changed' || event.type === 'model:changed' || event.type === 'context:changed') {
    project.fetchStatus()
  }
})

onMounted(() => {
  project.fetchStatus()
})
</script>

<template>
  <div class="flex h-screen max-h-screen w-full max-w-[1920px] mx-auto">
    <!-- Primary Sidebar (desktop) -->
    <PrimarySidebar class="hidden md:flex" />

    <!-- Main area -->
    <div class="flex flex-1 flex-col min-w-0">
      <main class="flex-1 overflow-y-auto custom-scrollbar pb-16 md:pb-0">
        <RouterView />
      </main>
      <StatusBar class="hidden md:flex" />
    </div>

    <!-- Mobile bottom nav -->
    <MobileNav class="md:hidden" />
  </div>
</template>

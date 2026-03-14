<script setup lang="ts">
import { RouterView, useRoute } from 'vue-router'
import { computed } from 'vue'
import PrimarySidebar from './PrimarySidebar.vue'
import SubSidebarLayout from './SubSidebarLayout.vue'
import StatusBar from './StatusBar.vue'
import MobileNav from './MobileNav.vue'
import { useProjectStore } from '@/stores/project'
import { useWatch } from '@/composables/useWatch'
import { onMounted } from 'vue'

const route = useRoute()
const project = useProjectStore()

const hasSubSidebar = computed(() => route.meta.subSidebar === true)
const subSidebarBasePath = computed(() => (route.meta.basePath as string) ?? '')
const subSidebarParamKey = computed(() => (route.meta.paramKey as string) ?? '')

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
  <div class="flex h-screen max-h-screen w-full max-w-480 mx-auto">
    <!-- Primary Sidebar (desktop) -->
    <PrimarySidebar class="hidden md:flex" />

    <!-- Main area -->
    <div class="flex flex-1 flex-col min-w-0">
      <main class="flex-1 overflow-hidden pb-16 md:pb-0">
        <!-- With sub-sidebar -->
        <SubSidebarLayout v-if="hasSubSidebar" :base-path="subSidebarBasePath" :param-key="subSidebarParamKey">
          <RouterView />
        </SubSidebarLayout>

        <!-- Without sub-sidebar -->
        <div v-else class="h-full overflow-y-auto custom-scrollbar">
          <RouterView />
        </div>
      </main>
      <StatusBar class="hidden md:flex" />
    </div>

    <!-- Mobile bottom nav -->
    <MobileNav class="md:hidden" />
  </div>
</template>

<script setup lang="ts">
import { RouterView, useRoute, useRouter } from 'vue-router'
import { computed, onMounted } from 'vue'
import { toast } from 'vue-sonner'
import { dictionary } from '#contentrain'
import PrimarySidebar from './PrimarySidebar.vue'
import SubSidebarLayout from './SubSidebarLayout.vue'
import StatusBar from './StatusBar.vue'
import MobileNav from './MobileNav.vue'
import { useProjectStore } from '@/stores/project'
import { useWatch } from '@/composables/useWatch'

const t = dictionary('serve-ui-texts').locale('en').get()

const route = useRoute()
const router = useRouter()
const project = useProjectStore()

const hasSubSidebar = computed(() => route.meta.subSidebar === true)
const subSidebarBasePath = computed(() => (route.meta.basePath as string) ?? '')
const subSidebarParamKey = computed(() => (route.meta.paramKey as string) ?? '')

// Live updates — refresh project state on config/model/context events,
// surface merge/sync events as toasts so users never miss silent
// failures from the serve backend.
useWatch((event) => {
  if (
    event.type === 'config:changed'
    || event.type === 'model:changed'
    || event.type === 'context:changed'
  ) {
    project.fetchStatus()
    project.fetchCapabilities()
  }
  if (
    event.type === 'branch:created'
    || event.type === 'branch:merged'
    || event.type === 'branch:rejected'
  ) {
    project.fetchCapabilities()
  }
  if (event.type === 'sync:warning' && event.branch) {
    const branch = event.branch
    const count = event.skippedCount ?? 0
    toast.warning(`${count} file(s) skipped during sync`, {
      description: `Uncommitted local changes blocked the selective sync for ${branch}.`,
      action: {
        label: 'View details',
        onClick: () => router.push(`/branches/${branch}`),
      },
    })
  }
  if (event.type === 'branch:merge-conflict' && event.branch) {
    toast.error(`Merge conflict on ${event.branch}`, {
      description: event.message ?? 'Merge failed — resolve manually and retry.',
    })
  }
  if (event.type === 'meta:changed' && event.modelId) {
    // Light touch — SEO metadata doesn't drive the review workflow, so
    // only surface a low-priority toast. The store cache invalidates
    // through `fetchStatus` on the next real trigger.
    const scope = event.entryId
      ? `${event.modelId}/${event.entryId}`
      : event.modelId
    toast.message(t['layout.meta-changed-title'], {
      description: `${scope}${event.locale ? ` (${event.locale})` : ''}`,
    })
  }
  if (event.type === 'file-watch:error') {
    // Banner state — persists until the user dismisses. chokidar
    // failures mean live updates have stopped; silence would leave
    // the UI rendering stale data indefinitely.
    project.setFileWatchError(
      event.message ?? 'File watcher stopped unexpectedly.',
      event.timestamp ?? new Date().toISOString(),
    )
  }
})

onMounted(() => {
  project.fetchStatus()
  project.fetchCapabilities()
})
</script>

<template>
  <div class="flex h-screen max-h-screen w-full max-w-480 mx-auto">
    <!-- Primary Sidebar (desktop) -->
    <PrimarySidebar class="hidden md:flex" />

    <!-- Main area -->
    <div class="flex flex-1 flex-col min-w-0">
      <!-- Global branch-health banner: shown when MCP reports warning or blocked state -->
      <div
        v-if="project.branchHealthAlarm"
        class="px-4 py-2 text-sm font-medium border-b flex items-center justify-between gap-4"
        :class="project.branchHealthAlarm.level === 'blocked'
          ? 'bg-destructive text-destructive-foreground border-destructive/50'
          : 'bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-950 dark:text-amber-100 dark:border-amber-900'"
      >
        <span>
          <strong>{{ project.branchHealthAlarm.level === 'blocked' ? 'Blocked:' : 'Warning:' }}</strong>
          {{ project.branchHealthAlarm.message }}
        </span>
        <RouterLink to="/branches" class="underline">Review branches</RouterLink>
      </div>

      <!-- File-watcher error banner: chokidar stopped — live updates
           are no longer flowing and the UI must surface that instead
           of silently rendering stale data. -->
      <div
        v-if="project.fileWatchError"
        class="px-4 py-2 text-sm font-medium border-b flex items-center justify-between gap-4 bg-destructive text-destructive-foreground border-destructive/50"
      >
        <span>
          <strong>{{ t['layout.watcher-paused-label'] }}</strong>
          {{ project.fileWatchError.message }}
          <span class="opacity-80 ml-1 text-xs">({{ t['layout.watcher-restart-hint'] }})</span>
        </span>
        <button
          class="underline hover:no-underline shrink-0"
          @click="project.dismissFileWatchError()"
        >
          {{ t['layout.dismiss'] }}
        </button>
      </div>

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

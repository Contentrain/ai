<script setup lang="ts">
import { onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useContentStore } from '@/stores/content'
import { useWatch } from '@/composables/useWatch'
import { GitBranch, RefreshCw } from 'lucide-vue-next'
import PageHeader from '@/components/layout/PageHeader.vue'
import StudioHint from '@/components/layout/StudioHint.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

const store = useContentStore()
const router = useRouter()

const branches = computed(() => store.branches)

function branchLabel(name: string): string {
  const parts = name.replace('contentrain/', '').split('/')
  return parts.length > 1 ? `${parts[0]} / ${parts.slice(1).join('/')}` : parts[0]
}

function branchScope(name: string): string {
  return name.split('/')[1] ?? 'unknown'
}

const scopeColors: Record<string, string> = {
  content: 'bg-primary/10 text-primary',
  model: 'bg-status-info/10 text-status-info',
  normalize: 'bg-status-warning/10 text-status-warning',
  validate: 'bg-status-success/10 text-status-success',
}

onMounted(() => { store.fetchBranches() })

useWatch((event) => {
  if (event.type === 'branch:created' || event.type === 'branch:merged') store.fetchBranches()
})
</script>

<template>
  <div>
    <PageHeader title="Branches" :description="`${branches.length} pending contentrain branches`">
      <template #actions>
        <Button variant="outline" size="sm" :disabled="store.loading" @click="store.fetchBranches()">
          <RefreshCw class="mr-1.5 size-4" :class="store.loading && 'animate-spin'" /> Refresh
        </Button>
      </template>
    </PageHeader>

    <div class="px-6 py-6">
      <div v-if="store.loading && branches.length === 0" class="flex justify-center py-12">
        <div class="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>

      <div v-else-if="branches.length === 0" class="flex flex-col items-center py-16 text-center">
        <img src="/merge-1.svg" alt="" class="mb-6 h-28 opacity-50 dark:opacity-30" />
        <h2 class="text-lg font-semibold">No pending branches</h2>
        <p class="mt-2 text-sm text-muted-foreground">AI changes from your IDE will appear here for review.</p>
      </div>

      <div v-else class="space-y-2">
        <button
          v-for="branch in branches"
          :key="branch.name"
          class="flex w-full items-center gap-3 rounded-lg border border-border bg-card p-4 text-left transition-all hover:border-primary/30 hover:shadow-sm"
          @click="router.push(`/branches/${encodeURIComponent(branch.name)}`)"
        >
          <div class="flex size-9 items-center justify-center rounded-md bg-muted">
            <GitBranch class="size-4 text-muted-foreground" />
          </div>
          <div class="flex-1 min-w-0">
            <span class="font-mono text-sm font-medium text-foreground">{{ branchLabel(branch.name) }}</span>
          </div>
          <Badge :class="scopeColors[branchScope(branch.name)] ?? 'bg-muted text-muted-foreground'" class="text-[10px]">
            {{ branchScope(branch.name) }}
          </Badge>
        </button>
      </div>

      <StudioHint id="branches" message="Share branch reviews with your team in Contentrain Studio." class="mt-6" />
    </div>
  </div>
</template>

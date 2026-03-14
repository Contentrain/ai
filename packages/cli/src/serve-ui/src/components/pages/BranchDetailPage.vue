<script setup lang="ts">
import { onMounted, computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useContentStore } from '@/stores/content'
import { ArrowLeft, Check, X, GitMerge } from 'lucide-vue-next'
import PageHeader from '@/components/layout/PageHeader.vue'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

const route = useRoute()
const router = useRouter()
const store = useContentStore()

const branchName = computed(() => decodeURIComponent(route.params.branchName as string))
const diff = computed(() => store.branchDiff)
const acting = ref(false)

const diffLines = computed(() => {
  if (!diff.value?.diff) return []
  return diff.value.diff.split('\n').map(line => ({
    text: line,
    type: line.startsWith('+') && !line.startsWith('+++') ? 'add' as const
      : line.startsWith('-') && !line.startsWith('---') ? 'remove' as const
      : line.startsWith('@@') ? 'hunk' as const
      : 'context' as const,
  }))
})

async function approve() {
  acting.value = true
  try {
    await store.approveBranch(branchName.value)
    router.push('/branches')
  } finally { acting.value = false }
}

async function reject() {
  acting.value = true
  try {
    await store.rejectBranch(branchName.value)
    router.push('/branches')
  } finally { acting.value = false }
}

onMounted(() => { store.fetchBranchDiff(branchName.value) })
</script>

<template>
  <div>
    <PageHeader :title="branchName.replace('contentrain/', '')" description="Branch diff">
      <template #actions>
        <Button variant="ghost" size="sm" @click="router.push('/branches')">
          <ArrowLeft class="mr-1.5 size-4" /> Back
        </Button>
        <Button variant="default" size="sm" :disabled="acting" @click="approve">
          <Check class="mr-1.5 size-4" /> Approve & Merge
        </Button>
        <Button variant="destructive" size="sm" :disabled="acting" @click="reject">
          <X class="mr-1.5 size-4" /> Reject
        </Button>
      </template>
    </PageHeader>

    <div class="px-6 py-6 space-y-4">
      <div v-if="store.loading" class="flex justify-center py-12">
        <div class="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>

      <template v-else-if="diff">
        <!-- Stat summary -->
        <div class="flex items-center gap-3">
          <Badge variant="outline"><GitMerge class="mr-1 size-3" /> {{ diff.base }} ← {{ branchName.split('/').pop() }}</Badge>
        </div>

        <!-- Stat -->
        <pre v-if="diff.stat" class="rounded-lg border border-border bg-card p-4 font-mono text-xs text-muted-foreground overflow-x-auto">{{ diff.stat }}</pre>

        <!-- Diff -->
        <div v-if="diffLines.length > 0" class="rounded-lg border border-border overflow-hidden">
          <div class="max-h-[600px] overflow-auto custom-scrollbar">
            <pre class="p-0 m-0"><code class="block text-xs leading-5"><template
  v-for="(line, i) in diffLines"
  :key="i"
><span
  :class="{
    'bg-status-success/10 text-status-success': line.type === 'add',
    'bg-status-error/10 text-status-error': line.type === 'remove',
    'bg-primary/5 text-primary font-medium': line.type === 'hunk',
    'text-muted-foreground': line.type === 'context',
  }"
  class="block px-4 font-mono"
>{{ line.text }}</span></template></code></pre>
          </div>
        </div>

        <div v-else class="text-sm text-muted-foreground text-center py-8">No diff available</div>
      </template>
    </div>
  </div>
</template>

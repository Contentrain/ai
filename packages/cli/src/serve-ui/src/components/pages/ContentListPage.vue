<script setup lang="ts">
import { onMounted, computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useContentStore, type ContentListResult } from '@/stores/content'
import { useProjectStore } from '@/stores/project'
import { useWatch } from '@/composables/useWatch'
import { ArrowLeft, AlertTriangle } from 'lucide-vue-next'
import PageHeader from '@/components/layout/PageHeader.vue'
import StudioHint from '@/components/layout/StudioHint.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

const route = useRoute()
const router = useRouter()
const store = useContentStore()
const project = useProjectStore()

const modelId = computed(() => route.params.modelId as string)
const locales = computed(() => project.status?.config?.locales.supported ?? ['en'])
const selectedLocale = ref<string | undefined>(undefined)

const entries = computed((): Record<string, unknown>[] => {
  const cl = store.contentList
  if (!cl) return []
  if (cl.kind === 'collection' || cl.kind === 'document') return (Array.isArray(cl.data) ? cl.data : []) as Record<string, unknown>[]
  if (cl.kind === 'singleton') return [cl.data as Record<string, unknown>]
  if (cl.kind === 'dictionary') return Object.entries(cl.data as Record<string, string>).map(([k, v]) => ({ key: k, value: v }) as Record<string, unknown>)
  return []
})

const fieldNames = computed(() => {
  if (entries.value.length === 0) return []
  const first = entries.value[0] as Record<string, unknown> | undefined
  if (!first || typeof first !== 'object') return []
  if (!first) return []
  return Object.keys(first as Record<string, unknown>).filter(k => !k.startsWith('_')).slice(0, 5)
})

function truncate(val: unknown, max = 40): string {
  const s = typeof val === 'string' ? val : JSON.stringify(val) ?? ''
  return s.length > max ? s.slice(0, max) + '...' : s
}

function load() {
  store.fetchContent(modelId.value, selectedLocale.value)
}

onMounted(load)
watch(modelId, load)
watch(selectedLocale, load)

useWatch((event) => {
  if (event.type === 'content:changed' && event.modelId === modelId.value) load()
})
</script>

<template>
  <div>
    <PageHeader :title="modelId" description="Content entries">
      <template #actions>
        <Button variant="ghost" size="sm" @click="router.push('/content')">
          <ArrowLeft class="mr-1.5 size-4" /> Back
        </Button>
        <select
          v-if="locales.length > 1"
          v-model="selectedLocale"
          class="h-8 rounded-md border border-input bg-background px-2 text-xs"
        >
          <option :value="undefined">All locales</option>
          <option v-for="loc in locales" :key="loc" :value="loc">{{ loc }}</option>
        </select>
      </template>
    </PageHeader>

    <div class="px-6 py-6">
      <!-- Loading -->
      <div v-if="store.loading" class="flex justify-center py-12">
        <div class="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>

      <!-- Empty -->
      <div v-else-if="entries.length === 0" class="flex flex-col items-center py-16 text-center">
        <img src="/empty-state-manual.svg" alt="" class="mb-6 h-28 opacity-50 dark:opacity-30" />
        <h2 class="text-lg font-semibold">No entries yet</h2>
        <p class="mt-2 text-sm text-muted-foreground">Create content using AI in your IDE.</p>
      </div>

      <!-- Table -->
      <div v-else class="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead v-for="field in fieldNames" :key="field" class="text-xs">{{ field }}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="(entry, i) in entries" :key="i" class="cursor-default hover:bg-muted/50">
              <TableCell v-for="field in fieldNames" :key="field" class="text-sm">
                <template v-if="entry[field] === undefined || entry[field] === null || entry[field] === ''">
                  <span class="flex items-center gap-1 text-xs text-status-warning">
                    <AlertTriangle class="size-3" /> missing
                  </span>
                </template>
                <template v-else>{{ truncate(entry[field]) }}</template>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      <StudioHint id="content" message="Edit content with AI chat in Contentrain Studio." class="mt-6" />
    </div>
  </div>
</template>

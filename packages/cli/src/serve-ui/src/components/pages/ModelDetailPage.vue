<script setup lang="ts">
import { onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useContentStore } from '@/stores/content'
import { ArrowLeft } from 'lucide-vue-next'
import PageHeader from '@/components/layout/PageHeader.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

const route = useRoute()
const router = useRouter()
const store = useContentStore()

const modelId = computed(() => route.params.modelId as string)
const model = computed(() => store.modelDescription)
const fields = computed(() => {
  if (!model.value?.fields) return []
  return Object.entries(model.value.fields).map(([name, def]) => ({ name, ...def }))
})

onMounted(() => { store.fetchModelDescription(modelId.value) })
</script>

<template>
  <div>
    <PageHeader :title="modelId" :description="model?.description || `${model?.kind ?? ''} model`">
      <template #actions>
        <Button variant="ghost" size="sm" @click="router.push('/models')">
          <ArrowLeft class="mr-1.5 size-4" /> Back
        </Button>
        <Button variant="outline" size="sm" @click="router.push(`/content/${modelId}`)">View Content</Button>
      </template>
    </PageHeader>

    <div class="px-6 py-6 space-y-6">
      <div v-if="model" class="flex flex-wrap gap-2">
        <Badge variant="secondary">{{ model.kind }}</Badge>
        <Badge variant="secondary">{{ model.domain }}</Badge>
        <Badge v-if="model.i18n" variant="outline" class="text-status-info border-status-info/30">i18n</Badge>
        <Badge variant="outline">{{ model.stats.total_entries }} entries</Badge>
      </div>

      <div v-if="fields.length > 0" class="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead class="w-[200px]">Field</TableHead>
              <TableHead class="w-[120px]">Type</TableHead>
              <TableHead class="w-[100px]">Required</TableHead>
              <TableHead>Default</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="field in fields" :key="field.name">
              <TableCell class="font-mono text-sm font-medium">{{ field.name }}</TableCell>
              <TableCell><Badge variant="secondary" class="font-mono text-xs">{{ field.type }}</Badge></TableCell>
              <TableCell>
                <span :class="field.required ? 'text-status-success' : 'text-muted-foreground'">{{ field.required ? 'Yes' : '—' }}</span>
              </TableCell>
              <TableCell class="font-mono text-xs text-muted-foreground">{{ field.default !== undefined ? JSON.stringify(field.default) : '—' }}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      <div v-if="store.loading" class="flex justify-center py-12">
        <div class="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    </div>
  </div>
</template>

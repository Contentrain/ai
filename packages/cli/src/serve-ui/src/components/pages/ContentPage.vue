<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useProjectStore, type ModelSummary } from '@/stores/project'
import { FileText, Database, BookOpen, Languages, Search } from 'lucide-vue-next'
import PageHeader from '@/components/layout/PageHeader.vue'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { dictionary } from '#contentrain'

const t = dictionary('serve-ui-texts').locale('en').get()

const project = useProjectStore()
const router = useRouter()
const search = ref('')

const models = computed(() => {
  const list = project.status?.models ?? []
  if (!search.value) return list
  const q = search.value.toLowerCase()
  return list.filter(m =>
    m.id.toLowerCase().includes(q) || m.domain.toLowerCase().includes(q),
  )
})

const groupedByDomain = computed(() => {
  const groups: Record<string, ModelSummary[]> = {}
  for (const model of models.value) {
    const domain = model.domain || 'default'
    if (!groups[domain]) groups[domain] = []
    groups[domain].push(model)
  }
  return groups
})

const kindConfig: Record<string, { icon: typeof FileText; color: string; label: string }> = {
  collection: { icon: Database, color: 'bg-primary/10 text-primary', label: t['content.collection'] },
  singleton: { icon: FileText, color: 'bg-status-info/10 text-status-info', label: t['content.singleton'] },
  document: { icon: BookOpen, color: 'bg-status-success/10 text-status-success', label: t['content.document'] },
  dictionary: { icon: FileText, color: 'bg-status-warning/10 text-status-warning', label: t['content.dictionary'] },
}

function getKindConfig(kind: string) {
  return kindConfig[kind] ?? kindConfig.collection
}
</script>

<template>
  <div>
    <PageHeader :title="t['content.content']" :description="t['content.browse-and-inspect-content']" />

    <div class="px-6 py-6">
      <!-- Empty state -->
      <div v-if="(project.status?.models ?? []).length === 0" class="flex flex-col items-center py-16 text-center">
        <div class="mb-4 flex size-14 items-center justify-center rounded-full bg-muted">
          <FileText class="size-6 text-muted-foreground" />
        </div>
        <h2 class="text-lg font-semibold">{{ t['content.no-models-yet'] }}</h2>
        <p class="mt-2 max-w-sm text-sm text-muted-foreground">
          {{ t['content.create-models-using-your'] }}
        </p>
      </div>

      <template v-else>
        <!-- Search -->
        <div class="relative mb-6 max-w-sm">
          <Search class="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            v-model="search"
            :placeholder="t['content.filter-models']"
            class="h-9 pl-9 text-sm"
          />
        </div>

        <!-- Grouped model list -->
        <div v-for="(domainModels, domain) in groupedByDomain" :key="domain" class="mb-8 last:mb-0">
          <h3 class="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {{ domain }}
          </h3>
          <div class="space-y-1.5">
            <button
              v-for="model in domainModels"
              :key="model.id"
              :class="cn(
                'group flex w-full items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-left transition-all',
                'hover:border-primary/30 hover:shadow-sm',
              )"
              @click="router.push(`/content/${model.id}`)"
            >
              <!-- Kind icon -->
              <div :class="cn('flex size-8 shrink-0 items-center justify-center rounded-md', getKindConfig(model.kind).color)">
                <component :is="getKindConfig(model.kind).icon" class="size-4" />
              </div>

              <!-- Name + domain -->
              <div class="min-w-0 flex-1">
                <span class="font-medium text-foreground">{{ model.id }}</span>
              </div>

              <!-- Badges -->
              <div class="flex items-center gap-2 shrink-0">
                <Badge variant="secondary" class="text-[10px]">
                  {{ getKindConfig(model.kind).label }}
                </Badge>
                <Badge variant="outline" class="text-[10px]">
                  {{ model.fields }} {{ t['content.fields'] }}
                </Badge>
                <Badge
                  v-if="model.i18n"
                  variant="outline"
                  class="text-[10px] text-status-info border-status-info/30"
                >
                  <Languages class="mr-0.5 size-3" />
                  {{ t['content.i18n'] }}
                </Badge>
              </div>
            </button>
          </div>
        </div>

        <!-- No results from filter -->
        <div v-if="models.length === 0 && search" class="py-12 text-center text-sm text-muted-foreground">
          {{ t['content.no-models-matching'] }}{{ search }}"
        </div>
      </template>
    </div>
  </div>
</template>

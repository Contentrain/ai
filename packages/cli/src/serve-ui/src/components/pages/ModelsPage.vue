<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useProjectStore, type ModelSummary } from '@/stores/project'
import {
  Box,
  FileText,
  FileCode,
  BookOpen,
  Hash,
  Search,
  X,
  Languages,
} from 'lucide-vue-next'
import PageHeader from '@/components/layout/PageHeader.vue'
import StudioHint from '@/components/layout/StudioHint.vue'
import AgentPrompt from '@/components/layout/AgentPrompt.vue'
import AgentPromptGroup from '@/components/layout/AgentPromptGroup.vue'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

const project = useProjectStore()
const router = useRouter()

const searchQuery = ref('')
const searchOpen = ref(false)

const models = computed(() => project.status?.models ?? [])

const filteredModels = computed(() => {
  const q = searchQuery.value.toLowerCase().trim()
  if (!q) return models.value
  return models.value.filter(
    (m) =>
      m.id.toLowerCase().includes(q) ||
      m.domain.toLowerCase().includes(q) ||
      m.kind.toLowerCase().includes(q),
  )
})

const groupedByDomain = computed(() => {
  const groups: Record<string, ModelSummary[]> = {}
  for (const model of filteredModels.value) {
    const domain = model.domain || 'default'
    if (!groups[domain]) groups[domain] = []
    groups[domain].push(model)
  }
  return groups
})

const hasDomains = computed(() => Object.keys(groupedByDomain.value).length > 1)

const kindIcons: Record<string, typeof Box> = {
  collection: Box,
  singleton: FileText,
  document: FileCode,
  dictionary: BookOpen,
}

const kindColors: Record<string, string> = {
  collection: 'bg-primary/10 text-primary',
  singleton: 'bg-sky-500/10 text-sky-600',
  document: 'bg-emerald-500/10 text-emerald-600',
  dictionary: 'bg-amber-500/10 text-amber-600',
}

const kindBadgeColors: Record<string, string> = {
  collection: 'bg-primary/10 text-primary border-primary/20',
  singleton: 'bg-sky-500/10 text-sky-600 border-sky-500/20',
  document: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  dictionary: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
}

function clearSearch() {
  searchQuery.value = ''
  searchOpen.value = false
}
</script>

<template>
  <div>
    <PageHeader title="Models" description="Content model definitions">
      <template #actions>
        <button
          v-if="models.length > 0"
          class="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          @click="searchOpen = !searchOpen"
        >
          <Search class="size-3.5" />
          <span class="hidden sm:inline">Search</span>
        </button>
      </template>
    </PageHeader>

    <div class="px-6 py-6 space-y-6">
      <!-- Search bar (collapsible) -->
      <div
        v-if="searchOpen"
        class="flex items-center gap-2"
      >
        <div class="relative flex-1">
          <Search class="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            v-model="searchQuery"
            placeholder="Search models by name, domain, or kind..."
            class="pl-9 pr-9"
            autofocus
          />
          <button
            v-if="searchQuery"
            class="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            @click="searchQuery = ''"
          >
            <X class="size-3.5" />
          </button>
        </div>
        <button
          class="shrink-0 rounded-md px-2.5 py-2 text-xs text-muted-foreground hover:bg-accent"
          @click="clearSearch"
        >
          Close
        </button>
      </div>

      <!-- Loading -->
      <div v-if="project.loading && !project.status" class="flex items-center justify-center py-20">
        <div class="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>

      <!-- Empty state -->
      <div v-else-if="models.length === 0" class="flex flex-col items-center py-16 text-center">
        <img src="/model-empty-state.svg" alt="" class="empty-illustration mb-6" />
        <h2 class="text-lg font-semibold text-foreground">No models yet</h2>
        <p class="mt-2 max-w-sm text-sm text-muted-foreground">
          Create content models using AI in your IDE, then come back to inspect them here.
        </p>

        <AgentPromptGroup title="Ask your agent" class="mt-6 w-full max-w-md">
          <AgentPrompt prompt="Create a blog model with title, content, slug, and author fields" />
          <AgentPrompt prompt="Create a FAQ model with question and answer fields" />
          <AgentPrompt prompt="Scaffold my project with a landing page template" />
        </AgentPromptGroup>
      </div>

      <!-- No search results -->
      <div
        v-else-if="filteredModels.length === 0 && searchQuery"
        class="flex flex-col items-center py-16 text-center"
      >
        <Search class="mb-4 size-10 text-muted-foreground/40" />
        <h2 class="text-lg font-semibold text-foreground">No models found</h2>
        <p class="mt-2 text-sm text-muted-foreground">
          No models match "<span class="font-medium">{{ searchQuery }}</span>". Try a different search term.
        </p>
        <button
          class="mt-4 text-sm font-medium text-primary hover:underline"
          @click="searchQuery = ''"
        >
          Clear search
        </button>
      </div>

      <!-- Models list -->
      <template v-else>
        <!-- Ungrouped (single domain) -->
        <div v-if="!hasDomains" class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          <button
            v-for="model in filteredModels"
            :key="model.id"
            :class="cn(
              'group flex items-start gap-4 rounded-xl border bg-card p-4 text-left transition-all hover:shadow-sm',
              'border-border hover:border-primary/30',
            )"
            @click="router.push(`/models/${model.id}`)"
          >
            <div
              :class="cn(
                'flex size-10 shrink-0 items-center justify-center rounded-lg',
                kindColors[model.kind] ?? 'bg-muted text-muted-foreground',
              )"
            >
              <component :is="kindIcons[model.kind] ?? Hash" class="size-5" />
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <span class="font-medium text-foreground group-hover:text-primary transition-colors truncate">
                  {{ model.id }}
                </span>
                <Badge
                  variant="outline"
                  :class="cn(
                    'shrink-0 text-[10px] font-medium',
                    kindBadgeColors[model.kind] ?? '',
                  )"
                >
                  {{ model.kind }}
                </Badge>
              </div>
              <div class="mt-1.5 flex items-center gap-3 text-xs text-muted-foreground">
                <span>{{ model.fields }} fields</span>
                <span class="size-0.5 rounded-full bg-muted-foreground/40" />
                <span>{{ model.domain }}</span>
                <template v-if="model.i18n">
                  <span class="size-0.5 rounded-full bg-muted-foreground/40" />
                  <span class="inline-flex items-center gap-1 text-sky-600">
                    <Languages class="size-3" />
                    i18n
                  </span>
                </template>
              </div>
            </div>
          </button>
        </div>

        <!-- Grouped by domain -->
        <template v-else>
          <section
            v-for="(domainModels, domain) in groupedByDomain"
            :key="domain"
          >
            <div class="mb-3 flex items-center gap-2">
              <h2 class="text-sm font-medium text-muted-foreground">{{ domain }}</h2>
              <Badge variant="secondary" class="text-[10px]">{{ domainModels.length }}</Badge>
            </div>
            <div class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 mb-6">
              <button
                v-for="model in domainModels"
                :key="model.id"
                :class="cn(
                  'group flex items-start gap-4 rounded-xl border bg-card p-4 text-left transition-all hover:shadow-sm',
                  'border-border hover:border-primary/30',
                )"
                @click="router.push(`/models/${model.id}`)"
              >
                <div
                  :class="cn(
                    'flex size-10 shrink-0 items-center justify-center rounded-lg',
                    kindColors[model.kind] ?? 'bg-muted text-muted-foreground',
                  )"
                >
                  <component :is="kindIcons[model.kind] ?? Hash" class="size-5" />
                </div>
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2">
                    <span class="font-medium text-foreground group-hover:text-primary transition-colors truncate">
                      {{ model.id }}
                    </span>
                    <Badge
                      variant="outline"
                      :class="cn(
                        'shrink-0 text-[10px] font-medium',
                        kindBadgeColors[model.kind] ?? '',
                      )"
                    >
                      {{ model.kind }}
                    </Badge>
                  </div>
                  <div class="mt-1.5 flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{{ model.fields }} fields</span>
                    <template v-if="model.i18n">
                      <span class="size-0.5 rounded-full bg-muted-foreground/40" />
                      <span class="inline-flex items-center gap-1 text-sky-600">
                        <Languages class="size-3" />
                        i18n
                      </span>
                    </template>
                  </div>
                </div>
              </button>
            </div>
          </section>
        </template>

        <!-- Model count summary -->
        <div class="flex items-center gap-4 text-xs text-muted-foreground">
          <span>{{ filteredModels.length }} model{{ filteredModels.length === 1 ? '' : 's' }}</span>
          <span v-if="searchQuery" class="size-0.5 rounded-full bg-muted-foreground/40" />
          <span v-if="searchQuery">filtered from {{ models.length }} total</span>
        </div>
      </template>

      <AgentPromptGroup title="Ask your agent">
        <AgentPrompt prompt="Create a new content model" />
        <AgentPrompt prompt="Add a testimonials collection model" />
      </AgentPromptGroup>

      <StudioHint
        id="models"
        message="Create and manage models with AI chat in Contentrain Studio."
        class="mt-4"
      />
    </div>
  </div>
</template>

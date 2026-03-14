<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useProjectStore, type ModelSummary } from '@/stores/project'
import { Search } from 'lucide-vue-next'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { ref } from 'vue'

const props = defineProps<{
  basePath: string
  paramKey: string
}>()

const route = useRoute()
const router = useRouter()
const project = useProjectStore()
const search = ref('')

const models = computed(() => {
  const list = project.status?.models ?? []
  if (!search.value) return list
  const q = search.value.toLowerCase()
  return list.filter(m => m.id.toLowerCase().includes(q) || m.domain.toLowerCase().includes(q))
})

const activeId = computed(() => route.params[props.paramKey] as string | undefined)

const kindIcons: Record<string, string> = {
  collection: 'bg-primary/10 text-primary',
  singleton: 'bg-status-info/10 text-status-info',
  document: 'bg-status-success/10 text-status-success',
  dictionary: 'bg-status-warning/10 text-status-warning',
}
</script>

<template>
  <div class="flex h-full">
    <!-- Sub-sidebar -->
    <aside class="hidden w-55 shrink-0 flex-col border-r border-border sidebar-gradient lg:flex">
      <div class="p-3">
        <div class="relative">
          <Search class="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
          <Input v-model="search" placeholder="Search..." class="h-8 bg-background pl-8 text-xs" />
        </div>
      </div>
      <ScrollArea class="flex-1 px-1.5">
        <button v-for="model in models" :key="model.id" :class="cn(
          'flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors',
          activeId === model.id
            ? 'bg-background font-medium text-primary shadow-sm border border-border'
            : 'text-muted-foreground hover:bg-background/60 hover:text-foreground',
        )" @click="router.push(`${basePath}/${model.id}`)">
          <span :class="cn('size-1.5 rounded-full shrink-0', kindIcons[model.kind]?.split(' ')[0] ?? 'bg-muted')" />
          <span class="truncate flex-1">{{ model.id }}</span>
          <Badge variant="secondary" class="text-[10px] shrink-0 h-4 px-1">
            {{ model.kind === 'singleton' ? '1' : model.fields }}
          </Badge>
        </button>

        <div v-if="models.length === 0" class="px-3 py-6 text-center text-xs text-muted-foreground">
          No models found
        </div>
      </ScrollArea>
    </aside>

    <!-- Content area -->
    <div class="flex-1 min-w-0 overflow-y-auto custom-scrollbar">
      <slot />
    </div>
  </div>
</template>

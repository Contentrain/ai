<script setup lang="ts">
import { useRoute, RouterLink } from 'vue-router'
import { useUiStore } from '@/stores/ui'
import { useProjectStore } from '@/stores/project'
import { computed } from 'vue'
import {
  LayoutDashboard,
  Box,
  FileText,
  ShieldCheck,
  GitBranch,
  ScanSearch,
  Moon,
  Sun,
  Settings,
} from 'lucide-vue-next'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { useTexts } from '@/composables/useTexts'

const route = useRoute()
const { t } = useTexts()
const ui = useUiStore()
const project = useProjectStore()

const navItems = [
  { icon: LayoutDashboard, label: t('primary-sidebar.dashboard'), to: '/', exact: true },
  { icon: Box, label: t('primary-sidebar.models'), to: '/models' },
  { icon: FileText, label: t('primary-sidebar.content'), to: '/content' },
  { icon: ShieldCheck, label: t('primary-sidebar.validate'), to: '/validate' },
  { icon: GitBranch, label: t('primary-sidebar.branches'), to: '/branches' },
  { icon: ScanSearch, label: t('primary-sidebar.normalize'), to: '/normalize' },
]

function isActive(item: typeof navItems[0]): boolean {
  if (item.exact) return route.path === item.to
  return route.path.startsWith(item.to)
}

const branchCount = computed(() => project.status?.branches?.unmerged ?? 0)
const validationIssues = computed(() => {
  const v = project.status?.validation
  return v ? v.errors + v.warnings : 0
})
</script>

<template>
  <aside
    class="group flex h-screen w-[72px] min-w-[72px] flex-col overflow-hidden border-r border-border bg-card transition-all duration-200 ease-in-out hover:w-[220px] hover:min-w-[220px] xl:w-[220px] xl:min-w-[220px]"
  >
    <!-- Logo + Brand -->
    <div class="flex h-14 items-center gap-3 px-4 shrink-0">
      <img src="/icon-color.svg" alt="Contentrain" class="size-8 shrink-0" />
      <span
        class="truncate text-sm font-semibold text-foreground opacity-0 transition-opacity duration-200 group-hover:opacity-100 xl:opacity-100"
      >
        Contentrain
      </span>
    </div>

    <!-- Navigation -->
    <nav class="flex flex-1 flex-col gap-1 px-3 pt-4">
      <RouterLink
        v-for="item in navItems"
        :key="item.to"
        :to="item.to"
        :class="cn(
          'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all duration-150',
          isActive(item)
            ? 'bg-background text-primary font-medium shadow-sm border border-border'
            : 'text-muted-foreground hover:bg-background/60 hover:text-foreground',
        )"
      >
        <component :is="item.icon" class="size-5 shrink-0" />
        <span
          class="truncate opacity-0 transition-opacity duration-200 group-hover:opacity-100 xl:opacity-100"
        >
          {{ item.label }}
        </span>
        <!-- Badge for branches -->
        <Badge
          v-if="item.to === '/branches' && branchCount > 0"
          variant="secondary"
          class="ml-auto text-[10px] h-5 px-1.5 opacity-0 group-hover:opacity-100 xl:opacity-100 transition-opacity"
        >
          {{ branchCount }}
        </Badge>
        <!-- Badge for validation issues -->
        <Badge
          v-if="item.to === '/validate' && validationIssues > 0"
          class="ml-auto text-[10px] h-5 px-1.5 bg-status-error/10 text-status-error border-0 opacity-0 group-hover:opacity-100 xl:opacity-100 transition-opacity"
        >
          {{ validationIssues }}
        </Badge>
      </RouterLink>
    </nav>

    <!-- Bottom: Theme toggle -->
    <div class="flex items-center gap-3 px-3 pb-4 mt-auto">
      <button
        :class="cn(
          'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm w-full transition-all duration-150',
          'text-muted-foreground hover:bg-background/60 hover:text-foreground',
        )"
        @click="ui.toggleTheme()"
      >
        <Sun v-if="ui.colorMode === 'dark'" class="size-5 shrink-0" />
        <Moon v-else class="size-5 shrink-0" />
        <span class="truncate opacity-0 transition-opacity duration-200 group-hover:opacity-100 xl:opacity-100">
          {{ ui.colorMode === 'dark' ? 'Light mode' : 'Dark mode' }}
        </span>
      </button>
    </div>
  </aside>
</template>

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
  Github,
  BookOpen,
} from 'lucide-vue-next'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

const route = useRoute()
const ui = useUiStore()
const project = useProjectStore()

const navItems = [
  { icon: LayoutDashboard, label: 'Dashboard', to: '/', exact: true },
  { icon: Box, label: 'Models', to: '/models' },
  { icon: FileText, label: 'Content', to: '/content' },
  { icon: ShieldCheck, label: 'Validate', to: '/validate' },
  { icon: GitBranch, label: 'Branches', to: '/branches' },
  { icon: ScanSearch, label: 'Normalize', to: '/normalize' },
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
    class="group flex h-screen w-18 min-w-18 flex-col overflow-hidden border-r border-border bg-card transition-all duration-200 ease-in-out hover:w-55 hover:min-w-55 xl:w-55 xl:min-w-55"
  >
    <!-- Logo + Brand -->
    <div class="flex h-14 items-center px-4 shrink-0">
      <img src="/icon-color.svg" alt="Contentrain" class="size-8 shrink-0 block group-hover:hidden xl:hidden" />
      <img src="/logo/color-icon-black-text.svg" alt="Contentrain" class="h-7 shrink-0 hidden group-hover:block xl:block dark:hidden" />
      <img src="/logo/color-icon-white-text.svg" alt="Contentrain" class="h-7 shrink-0 hidden dark:group-hover:block dark:xl:block" />
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

    <!-- Bottom: External links + Theme toggle -->
    <div class="flex flex-col gap-1 px-3 mt-auto">
      <a
        href="https://ai.contentrain.io"
        target="_blank"
        rel="noopener"
        :class="cn(
          'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all duration-150',
          'text-muted-foreground hover:bg-background/60 hover:text-foreground',
        )"
      >
        <BookOpen class="size-5 shrink-0" />
        <span class="truncate opacity-0 transition-opacity duration-200 group-hover:opacity-100 xl:opacity-100">
          Docs
        </span>
      </a>
      <a
        href="https://github.com/Contentrain/ai"
        target="_blank"
        rel="noopener"
        :class="cn(
          'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all duration-150',
          'text-muted-foreground hover:bg-background/60 hover:text-foreground',
        )"
      >
        <Github class="size-5 shrink-0" />
        <span class="truncate opacity-0 transition-opacity duration-200 group-hover:opacity-100 xl:opacity-100">
          GitHub
        </span>
      </a>
    </div>
    <div class="flex items-center gap-3 px-3 pb-4">
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

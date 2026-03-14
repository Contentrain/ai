<script setup lang="ts">
import { useRoute } from 'vue-router'
import { useUiStore } from '@/stores/ui'
import {
  LayoutDashboard,
  Box,
  FileText,
  ShieldCheck,
  GitBranch,
  ScanSearch,
  Moon,
  Sun,
} from 'lucide-vue-next'
import NavItem from './NavItem.vue'

const route = useRoute()
const ui = useUiStore()

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
</script>

<template>
  <aside class="flex h-screen w-[72px] flex-col border-r border-border bg-background">
    <!-- Logo -->
    <div class="flex h-16 items-center justify-center">
      <img src="/icon-color.svg" alt="Contentrain" class="size-8" />
    </div>

    <!-- Navigation -->
    <nav class="flex flex-1 flex-col items-center gap-1 px-2 pt-4">
      <NavItem
        v-for="item in navItems"
        :key="item.to"
        :icon="item.icon"
        :label="item.label"
        :to="item.to"
        :active="isActive(item)"
      />
    </nav>

    <!-- Theme toggle -->
    <div class="flex flex-col items-center gap-2 pb-4 px-2">
      <button
        class="flex size-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        @click="ui.toggleTheme()"
      >
        <Sun v-if="ui.colorMode === 'dark'" class="size-5" />
        <Moon v-else class="size-5" />
      </button>
    </div>
  </aside>
</template>

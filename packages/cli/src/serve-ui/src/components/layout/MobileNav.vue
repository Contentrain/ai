<script setup lang="ts">
import { useRoute } from 'vue-router'
import { RouterLink } from 'vue-router'
import {
  LayoutDashboard,
  Box,
  FileText,
  ShieldCheck,
  GitBranch,
} from 'lucide-vue-next'
import { cn } from '@/lib/utils'

const route = useRoute()

const items = [
  { icon: LayoutDashboard, label: 'Dash', to: '/', exact: true },
  { icon: Box, label: 'Models', to: '/models' },
  { icon: FileText, label: 'Content', to: '/content' },
  { icon: ShieldCheck, label: 'Valid.', to: '/validate' },
  { icon: GitBranch, label: 'Branch', to: '/branches' },
]

function isActive(item: typeof items[0]): boolean {
  if (item.exact) return route.path === item.to
  return route.path.startsWith(item.to)
}
</script>

<template>
  <nav class="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background">
    <div class="flex items-center justify-around py-2">
      <RouterLink
        v-for="item in items"
        :key="item.to"
        :to="item.to"
        :class="cn(
          'flex flex-col items-center gap-0.5 px-3 py-1 text-[10px]',
          isActive(item) ? 'text-primary' : 'text-muted-foreground',
        )"
      >
        <component :is="item.icon" class="size-5" />
        {{ item.label }}
      </RouterLink>
    </div>
  </nav>
</template>

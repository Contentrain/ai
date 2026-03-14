<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ChevronRight, Folder, FolderOpen, FileText, Check } from 'lucide-vue-next'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

export interface TreeNode {
  name: string
  path: string
  type: 'dir' | 'file'
  children?: TreeNode[]
  fileCount?: number
}

const props = defineProps<{
  nodes: TreeNode[]
  selected: Set<string>
}>()

const emit = defineEmits<{
  toggle: [path: string]
}>()

const expanded = ref<Set<string>>(new Set())

onMounted(() => {
  for (const node of props.nodes) {
    if (node.type === 'dir') expanded.value.add(node.path)
  }
})

// Flatten tree into visible list with depth
interface FlatItem {
  node: TreeNode
  depth: number
}

const flatList = computed((): FlatItem[] => {
  const items: FlatItem[] = []
  function walk(nodes: TreeNode[], depth: number) {
    for (const node of nodes) {
      items.push({ node, depth })
      if (node.type === 'dir' && expanded.value.has(node.path) && node.children) {
        walk(node.children, depth + 1)
      }
    }
  }
  walk(props.nodes, 0)
  return items
})

function toggleExpand(path: string) {
  if (expanded.value.has(path)) expanded.value.delete(path)
  else expanded.value.add(path)
}

function isSelected(path: string): boolean {
  return props.selected.has(path)
}
</script>

<template>
  <div class="max-h-88 overflow-y-auto custom-scrollbar p-1">
    <div
      v-for="item in flatList"
      :key="item.node.path"
      class="flex items-center gap-1.5 rounded-md px-2 py-1 hover:bg-accent transition-colors"
      :style="{ paddingLeft: `${item.depth * 16 + 8}px` }"
    >
      <!-- Expand toggle (dirs only) -->
      <button
        v-if="item.node.type === 'dir'"
        class="shrink-0 p-0.5"
        @click="toggleExpand(item.node.path)"
      >
        <ChevronRight :class="cn('size-3 text-muted-foreground transition-transform', expanded.has(item.node.path) && 'rotate-90')" />
      </button>
      <span v-else class="w-4 shrink-0" />

      <!-- Checkbox -->
      <button
        :class="cn(
          'flex size-3.5 shrink-0 items-center justify-center rounded border transition-colors',
          isSelected(item.node.path)
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-input hover:border-primary/50',
        )"
        @click="emit('toggle', item.node.path)"
      >
        <Check v-if="isSelected(item.node.path)" class="size-2.5" />
      </button>

      <!-- Icon -->
      <component
        :is="item.node.type === 'dir' ? (expanded.has(item.node.path) ? FolderOpen : Folder) : FileText"
        :class="cn('size-3.5 shrink-0', item.node.type === 'dir' ? 'text-amber-500' : 'text-muted-foreground')"
      />

      <!-- Name -->
      <span :class="cn('flex-1 text-xs truncate', item.node.type === 'file' && 'text-muted-foreground')">
        {{ item.node.name }}
      </span>

      <!-- File count badge (dirs only) -->
      <Badge v-if="item.node.type === 'dir' && item.node.fileCount" variant="secondary" class="text-[9px] h-4 px-1 shrink-0">
        {{ item.node.fileCount }}
      </Badge>
    </div>

    <div v-if="flatList.length === 0" class="py-4 text-center text-xs text-muted-foreground">
      No scannable files found
    </div>
  </div>
</template>

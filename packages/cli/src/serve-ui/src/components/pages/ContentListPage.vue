<script setup lang="ts">
import { onMounted, computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useContentStore } from '@/stores/content'
import { useProjectStore } from '@/stores/project'
import { useWatch } from '@/composables/useWatch'
import {
  formatDate, truncate, detectCellType, copyToClipboard,
  type CellDisplayType,
} from '@/composables/useFormatters'
import {
  AlertTriangle, RefreshCw, Search, ChevronLeft, ChevronRight,
  Copy, Check, ChevronDown, ChevronUp, FileText, SlidersHorizontal,
  Eye, EyeOff, Maximize2, GripVertical, Pin, PinOff, ArrowUp, ArrowDown,
  Loader2,
} from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import PageHeader from '@/components/layout/PageHeader.vue'
import StudioHint from '@/components/layout/StudioHint.vue'
import AgentPrompt from '@/components/layout/AgentPrompt.vue'
import AgentPromptGroup from '@/components/layout/AgentPromptGroup.vue'
import { Badge } from '@/components/ui/badge'
import { TrustBadge } from '@/components/ui/trust-badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { useTrustLevel } from '@/composables/useTrustLevel'
import { dictionary } from '#contentrain'

const t = dictionary('serve-ui-texts').locale('en').get()

const route = useRoute()
const store = useContentStore()
const project = useProjectStore()

// --- Route params ---
const modelId = computed(() => route.params.modelId as string)

// --- Model info ---
const modelInfo = computed(() =>
  project.status?.models?.find(m => m.id === modelId.value),
)

// --- Trust level ---
const { trustStatus, trustCount } = useTrustLevel(computed(() => store.validation))

// --- Locale ---
const locales = computed(() => project.status?.config?.locales.supported ?? [])
const hasI18n = computed(() => modelInfo.value?.i18n ?? false)
const selectedLocale = ref<string | undefined>(undefined)

// --- Search ---
const searchQuery = ref('')
const searchFocused = ref(false)

// --- Pagination ---
const pageSize = ref(20)
const currentPage = ref(1)
const pageInputValue = ref('1')

// --- Expand ---
const expandedRow = ref<number | null>(null)
const copiedId = ref<string | null>(null)

// --- Data processing ---
const rawEntries = computed((): Record<string, unknown>[] => {
  const cl = store.contentList
  if (!cl) return []
  if (cl.kind === 'collection' || cl.kind === 'document')
    return (Array.isArray(cl.data) ? cl.data : []) as Record<string, unknown>[]
  if (cl.kind === 'singleton') return [cl.data as Record<string, unknown>]
  if (cl.kind === 'dictionary')
    return Object.entries(cl.data as Record<string, string>).map(
      ([k, v]) => ({ key: k, value: v }) as Record<string, unknown>,
    )
  return []
})

// Filter entries by search query (client-side)
const filteredEntries = computed(() => {
  if (!searchQuery.value) return rawEntries.value
  const q = searchQuery.value.toLowerCase()
  return rawEntries.value.filter(entry =>
    Object.values(entry).some(val => {
      if (val === null || val === undefined) return false
      return String(val).toLowerCase().includes(q)
    }),
  )
})

const totalEntries = computed(() => filteredEntries.value.length)
const totalPages = computed(() => Math.max(1, Math.ceil(totalEntries.value / pageSize.value)))

// Paginated entries
const paginatedEntries = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return filteredEntries.value.slice(start, start + pageSize.value)
})

// Compute field columns from MODEL SCHEMA ORDER (not entry data keys)
const allFieldNames = computed(() => {
  const desc = store.modelDescription
  // Use schema field order if available (preserves definition order, not alphabetic)
  if (desc?.fields) {
    return Object.keys(desc.fields)
  }
  // Fallback to entry data keys
  if (rawEntries.value.length === 0) return []
  const first = rawEntries.value[0]
  if (!first || typeof first !== 'object') return []
  return Object.keys(first).filter(k => k !== 'id' && !k.startsWith('_'))
})

// Column management — visibility + ordering + pinning
const hiddenColumns = ref<Set<string>>(new Set())
const pinnedColumns = ref<Set<string>>(new Set())
const columnOrder = ref<string[]>([])
const draggedColumn = ref<string | null>(null)

// Default visible columns — prioritize required + simple types
const defaultVisibleNames = computed(() => {
  const desc = store.modelDescription
  if (!desc?.fields) return allFieldNames.value.slice(0, 6)

  const priorityOrder: Record<string, number> = {
    string: 1, text: 2, email: 3, url: 3, slug: 3, select: 4,
    number: 5, integer: 5, decimal: 5, percent: 5, rating: 5,
    boolean: 6, date: 7, datetime: 7,
    color: 8, phone: 8, code: 9, icon: 9,
    image: 10, video: 10, file: 10,
    markdown: 11, richtext: 11,
    relation: 12, relations: 12,
    array: 13, object: 14,
  }

  return Object.entries(desc.fields)
    .map(([name, def]) => ({
      name,
      priority: (def.required ? 0 : 100) + (priorityOrder[def.type] ?? 50),
    }))
    .toSorted((a, b) => a.priority - b.priority)
    .slice(0, 6)
    .map(f => f.name)
})

// Initialize column state
watch(allFieldNames, (names) => {
  if (names.length > 0 && columnOrder.value.length === 0) {
    columnOrder.value = [...names]
    const defaults = new Set(defaultVisibleNames.value)
    hiddenColumns.value.clear()
    for (const name of names) {
      if (!defaults.has(name)) hiddenColumns.value.add(name)
    }
  }
}, { immediate: true })

// Ordered columns for popover list
const orderedColumns = computed(() => {
  if (columnOrder.value.length === 0) return allFieldNames.value
  return columnOrder.value.filter(c => allFieldNames.value.includes(c))
})

// Visible fields in user-defined order (pinned first)
const visibleFieldNames = computed(() => {
  const visible = orderedColumns.value.filter(f => !hiddenColumns.value.has(f))
  const pinned = visible.filter(f => pinnedColumns.value.has(f))
  const unpinned = visible.filter(f => !pinnedColumns.value.has(f))
  return [...pinned, ...unpinned]
})

function toggleColumn(fieldName: string) {
  // Cannot hide pinned columns
  if (pinnedColumns.value.has(fieldName)) return
  if (hiddenColumns.value.has(fieldName)) {
    hiddenColumns.value.delete(fieldName)
  } else {
    hiddenColumns.value.add(fieldName)
  }
}

function togglePin(fieldName: string) {
  if (pinnedColumns.value.has(fieldName)) {
    pinnedColumns.value.delete(fieldName)
  } else {
    pinnedColumns.value.add(fieldName)
    // Pinned columns must be visible
    hiddenColumns.value.delete(fieldName)
  }
}

function showAllColumns() { hiddenColumns.value.clear() }
function resetColumns() {
  hiddenColumns.value.clear()
  pinnedColumns.value.clear()
  columnOrder.value = [...allFieldNames.value]
  const defaults = new Set(defaultVisibleNames.value)
  for (const name of allFieldNames.value) {
    if (!defaults.has(name)) hiddenColumns.value.add(name)
  }
}

// --- Column reorder via move up/down + drag ---
function moveColumn(field: string, direction: 'up' | 'down') {
  const order = [...columnOrder.value]
  const idx = order.indexOf(field)
  if (idx === -1) return
  const targetIdx = direction === 'up' ? idx - 1 : idx + 1
  if (targetIdx < 0 || targetIdx >= order.length) return
  // Swap
  const temp = order[targetIdx]
  order[targetIdx] = field
  order[idx] = temp
  columnOrder.value = order
}

// HTML5 drag-drop
function onDragStart(e: DragEvent, field: string) {
  draggedColumn.value = field
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', field)
  }
}

function onDragOver(e: DragEvent) {
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
}

function onDrop(e: DragEvent, targetField: string) {
  e.preventDefault()
  if (!draggedColumn.value || draggedColumn.value === targetField) return
  const order = [...columnOrder.value]
  const fromIdx = order.indexOf(draggedColumn.value)
  const toIdx = order.indexOf(targetField)
  if (fromIdx === -1 || toIdx === -1) return
  order.splice(fromIdx, 1)
  order.splice(toIdx, 0, draggedColumn.value)
  columnOrder.value = order
  draggedColumn.value = null
}

function onDragEnd() {
  draggedColumn.value = null
}

// --- Model field type + required maps from description ---
const fieldTypeMap = computed((): Record<string, string> => {
  const desc = store.modelDescription
  if (!desc?.fields) return {}
  const map: Record<string, string> = {}
  for (const [key, field] of Object.entries(desc.fields)) {
    map[key] = field.type
  }
  return map
})

const fieldRequiredMap = computed((): Record<string, boolean> => {
  const desc = store.modelDescription
  if (!desc?.fields) return {}
  const map: Record<string, boolean> = {}
  for (const [key, field] of Object.entries(desc.fields)) {
    map[key] = field.required === true
  }
  return map
})

function isFieldRequired(fieldName: string): boolean {
  return fieldRequiredMap.value[fieldName] === true
}

// --- Copy entry as JSON ---
const copiedEntryId = ref<unknown>(null)

async function copyEntry(entry: Record<string, unknown>) {
  const json = JSON.stringify(entry, null, 2)
  const ok = await copyToClipboard(json)
  if (ok) {
    copiedEntryId.value = entry['id'] ?? Object.values(entry)[0]
    toast.success('Entry copied to clipboard.')
    setTimeout(() => { copiedEntryId.value = null }, 2000)
  } else {
    toast.error('Failed to copy entry.')
  }
}

// --- Preview dialog for long content ---
const previewOpen = ref(false)
const previewField = ref('')
const previewValue = ref<unknown>('')
const previewType = ref('')

function openPreview(fieldName: string, value: unknown) {
  previewField.value = fieldName
  previewValue.value = value
  previewType.value = fieldTypeMap.value[fieldName] ?? 'string'
  previewOpen.value = true
}

// Simple markdown→HTML for preview (no external deps)
function renderMarkdown(md: string): string {
  return md
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>')
    .replace(/^(.+)$/gm, (match) => match.startsWith('<') ? match : `<p>${match}</p>`)
}

function isLongContent(val: unknown, fieldName: string): boolean {
  const fType = fieldTypeMap.value[fieldName]
  if (fType === 'markdown' || fType === 'richtext' || fType === 'code' || fType === 'text') return true
  if (typeof val === 'string' && val.length > 100) return true
  if (typeof val === 'object' && val !== null && !Array.isArray(val)) return true
  return false
}

// --- Actions ---
async function load() {
  try {
    await Promise.all([
      store.fetchContent(modelId.value, selectedLocale.value),
      store.fetchModelDescription(modelId.value),
      store.fetchValidation(modelId.value),
    ])
  } catch (err) {
    toast.error('Failed to load content. Please try again.')
  }
}

async function refresh() {
  expandedRow.value = null
  await load()
}

function toggleRow(i: number) {
  expandedRow.value = expandedRow.value === i ? null : i
}

function goToPage(page: number) {
  const clamped = Math.max(1, Math.min(page, totalPages.value))
  currentPage.value = clamped
  pageInputValue.value = String(clamped)
  expandedRow.value = null
}

function handlePageInput(event: Event) {
  const input = event.target as HTMLInputElement
  const val = Number.parseInt(input.value, 10)
  if (!Number.isNaN(val)) {
    goToPage(val)
  } else {
    pageInputValue.value = String(currentPage.value)
  }
}

async function handleCopyId(id: string) {
  const ok = await copyToClipboard(id)
  if (ok) {
    copiedId.value = id
    toast.success('ID copied to clipboard.')
    setTimeout(() => { copiedId.value = null }, 2000)
  } else {
    toast.error('Failed to copy ID.')
  }
}

function getCellDisplayType(value: unknown, fieldName: string): CellDisplayType {
  return detectCellType(value, fieldTypeMap.value[fieldName])
}

function formatCellValue(value: unknown, fieldName: string): string {
  const cellType = getCellDisplayType(value, fieldName)
  if (cellType === 'date' && typeof value === 'string') {
    const { title, subtitle } = formatDate(value)
    return subtitle ? `${title} ${subtitle}` : title
  }
  return truncate(value, 60)
}

// --- Watchers ---
onMounted(load)
watch(modelId, () => {
  currentPage.value = 1
  pageInputValue.value = '1'
  searchQuery.value = ''
  expandedRow.value = null
  columnOrder.value = []
  hiddenColumns.value.clear()
  pinnedColumns.value.clear()
  load()
})
watch(selectedLocale, () => {
  currentPage.value = 1
  pageInputValue.value = '1'
  expandedRow.value = null
  load()
})

// Reset pagination when search changes
watch(searchQuery, () => {
  currentPage.value = 1
  pageInputValue.value = '1'
  expandedRow.value = null
})

// Sync page input when page changes externally
watch(currentPage, (v) => {
  pageInputValue.value = String(v)
})

useWatch((event) => {
  if (event.type === 'content:changed' && event.modelId === modelId.value) load()
})
</script>

<template>
  <div class="flex h-full flex-col">
    <!-- Header -->
    <PageHeader :title="modelId"
      :description="`${totalEntries} ${totalEntries === 1 ? 'entry' : 'entries'}${store.contentList?.kind ? ` \u00b7 ${store.contentList.kind}` : ''}`">
      <template #actions>
        <!-- Locale selector -->
        <Select v-if="hasI18n && locales.length > 1" :model-value="selectedLocale ?? '__all__'"
          @update:model-value="(v: any) => selectedLocale = v === '__all__' ? undefined : String(v)">
          <SelectTrigger size="sm" class="h-8 w-auto gap-1.5 text-xs">
            <SelectValue :placeholder="t['content-list.all-locales']" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">{{ t['content-list.all-locales'] }}</SelectItem>
            <SelectItem v-for="loc in locales" :key="loc" :value="loc">
              {{ loc }}
            </SelectItem>
          </SelectContent>
        </Select>

        <!-- Refresh -->
        <Button variant="outline" size="sm" class="h-8" :disabled="store.loading" @click="refresh">
          <Loader2 v-if="store.loading" class="mr-1.5 size-3.5 animate-spin" />
          <RefreshCw v-else class="mr-1.5 size-3.5" />
          {{ t['content-list.refresh'] }}
        </Button>
      </template>
    </PageHeader>

    <div class="flex flex-1 flex-col overflow-hidden px-6 py-4">
      <!-- Toolbar: search + trust badge -->
      <div class="mb-4 flex items-center gap-3">
        <TrustBadge :status="trustStatus" :count="trustCount" />
        <div :class="cn('relative transition-all duration-200', searchFocused || searchQuery ? 'w-72' : 'w-48')">
          <Search class="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input v-model="searchQuery" :placeholder="t['content-list.search-entries']" class="h-8 pl-8 text-xs"
            @focus="searchFocused = true" @blur="searchFocused = false" />
        </div>
        <div class="flex-1" />

        <!-- Column visibility filter -->
        <Popover>
          <PopoverTrigger as-child>
            <Button variant="outline" size="sm" class="h-8 gap-1.5 text-xs">
              <SlidersHorizontal class="size-3.5" />
              {{ t['content-list.columns'] }}
              <Badge v-if="hiddenColumns.size > 0" variant="secondary" class="h-4 px-1 text-[10px]">
                {{ visibleFieldNames.length }}/{{ allFieldNames.length }}
              </Badge>
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" class="w-65 p-0">
            <div class="border-b border-border px-3 py-2.5">
              <div class="flex items-center justify-between">
                <span class="text-xs font-medium text-foreground">{{ t['content-list.toggle-columns'] }}</span>
                <div class="flex gap-1">
                  <Button variant="link" size="sm" class="h-auto p-0 text-[10px] text-primary hover:underline"
                    @click="showAllColumns">{{ t['content-list.show-all'] }}</Button>
                  <span class="text-[10px] text-muted-foreground">·</span>
                  <Button variant="link" size="sm"
                    class="h-auto p-0 text-[10px] text-muted-foreground hover:text-foreground hover:underline"
                    @click="resetColumns">{{ t['content-list.reset'] }}</Button>
                </div>
              </div>
            </div>
            <div class="max-h-85 overflow-y-auto custom-scrollbar p-1.5">
              <div v-for="(field, fieldIdx) in orderedColumns" :key="field" :draggable="true" :class="cn(
                'flex w-full items-center gap-1 rounded-md px-1.5 py-1.5 text-xs transition-all',
                draggedColumn === field ? 'opacity-30 bg-accent scale-95' : 'hover:bg-accent',
                pinnedColumns.has(field) && 'bg-primary/5 border border-primary/10',
              )" @dragstart="(e) => onDragStart(e, field)" @dragover="onDragOver" @drop="(e) => onDrop(e, field)"
                @dragend="onDragEnd">
                <!-- Drag handle + move buttons -->
                <div class="flex shrink-0 items-center">
                  <GripVertical class="size-3.5 cursor-grab text-muted-foreground/40 active:cursor-grabbing" />
                  <div class="flex flex-col -space-y-0.5 ml-0.5">
                    <Button variant="ghost" size="sm"
                      class="h-auto p-0 text-muted-foreground/30 hover:text-foreground disabled:opacity-20"
                      :disabled="fieldIdx === 0" @click.stop="moveColumn(field, 'up')">
                      <ArrowUp class="size-2.5" />
                    </Button>
                    <Button variant="ghost" size="sm"
                      class="h-auto p-0 text-muted-foreground/30 hover:text-foreground disabled:opacity-20"
                      :disabled="fieldIdx === orderedColumns.length - 1" @click.stop="moveColumn(field, 'down')">
                      <ArrowDown class="size-2.5" />
                    </Button>
                  </div>
                </div>

                <!-- Visibility toggle -->
                <Button variant="ghost" size="sm" class="shrink-0 h-auto p-0.5" @click.stop="toggleColumn(field)">
                  <component :is="hiddenColumns.has(field) ? EyeOff : Eye"
                    :class="cn('size-3.5', hiddenColumns.has(field) ? 'text-muted-foreground/30' : 'text-foreground')" />
                </Button>

                <!-- Field name -->
                <span
                  :class="cn('flex-1 truncate', hiddenColumns.has(field) && 'text-muted-foreground/50 line-through')">
                  {{ field }}
                </span>

                <!-- Type badge -->
                <Badge v-if="fieldTypeMap[field]" variant="secondary"
                  :class="cn('text-[9px] h-4 px-1 shrink-0', hiddenColumns.has(field) && 'opacity-30')">
                  {{ fieldTypeMap[field] }}
                </Badge>

                <!-- Pin toggle -->
                <Button variant="ghost" size="sm" class="shrink-0 h-auto p-0.5" @click.stop="togglePin(field)">
                  <component :is="pinnedColumns.has(field) ? Pin : PinOff"
                    :class="cn('size-3', pinnedColumns.has(field) ? 'text-primary' : 'text-muted-foreground/30 hover:text-muted-foreground')" />
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>

        <span class="text-xs text-muted-foreground">
          {{ totalEntries }} {{ totalEntries === 1 ? 'entry' : 'entries' }}
        </span>
      </div>

      <!-- Agent prompt hints -->
      <AgentPromptGroup :title="t['content-list.ask-your-agent']" class="mb-4">
        <div class="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
          <AgentPrompt :prompt="`Add a new entry to ${modelId}`" />
          <AgentPrompt :prompt="`Update the content of ${modelId}`" />
          <AgentPrompt :prompt="`Translate ${modelId} content to Turkish`" />
          <AgentPrompt :prompt="`Delete draft entries from ${modelId}`" />
        </div>
      </AgentPromptGroup>

      <!-- Loading -->
      <div v-if="store.loading && rawEntries.length === 0" class="flex flex-1 items-center justify-center">
        <Loader2 class="size-6 animate-spin text-primary" />
      </div>

      <!-- Empty -->
      <div v-else-if="rawEntries.length === 0" class="flex flex-1 flex-col items-center justify-center text-center">
        <div class="mb-4 flex size-14 items-center justify-center rounded-full bg-muted">
          <FileText class="size-6 text-muted-foreground" />
        </div>
        <h2 class="text-lg font-semibold">{{ t['content-list.no-entries-yet'] }}</h2>
        <p class="mt-2 max-w-sm text-sm text-muted-foreground">
          {{ t['content-list.create-content-using-ai'] }}
        </p>
        <AgentPromptGroup :title="t['content-list.ask-your-agent']" class="mt-6 w-full max-w-md">
          <AgentPrompt :prompt="`Create sample content for ${modelId}`" />
          <AgentPrompt :prompt="`Generate 5 entries for ${modelId}`" />
        </AgentPromptGroup>
      </div>

      <!-- No search results -->
      <div v-else-if="filteredEntries.length === 0"
        class="flex flex-1 flex-col items-center justify-center text-center">
        <p class="text-sm text-muted-foreground">
          {{ t['content-list.no-entries-matching'] }}{{ searchQuery }}"
        </p>
      </div>

      <!-- Data table -->
      <template v-else>
        <div class="flex-1 overflow-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow class="hover:bg-transparent">
                <TableHead class="w-10 text-center text-[11px] font-medium text-muted-foreground">#</TableHead>
                <TableHead v-for="field in visibleFieldNames" :key="field" :class="cn(
                  'text-[11px] font-medium uppercase tracking-wider text-muted-foreground',
                  pinnedColumns.has(field) && 'bg-background/95 backdrop-blur',
                )">
                  <div class="flex items-center gap-1">
                    <Pin v-if="pinnedColumns.has(field)" class="size-2.5 text-primary/50" />
                    {{ field }}
                  </div>
                </TableHead>
                <TableHead class="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              <template v-for="(entry, i) in paginatedEntries" :key="i">
                <!-- Data row -->
                <TableRow :class="cn(
                  'group/row cursor-pointer transition-colors',
                  expandedRow === i ? 'bg-muted/50' : 'hover:bg-muted/30',
                  i % 2 === 1 && expandedRow !== i && 'bg-muted/15',
                )" @click="toggleRow(i)">
                  <!-- Row number -->
                  <TableCell class="w-10 text-center">
                    <div class="flex items-center justify-center gap-1">
                      <span class="text-[11px] text-muted-foreground">{{ (currentPage - 1) * pageSize + i + 1 }}</span>
                      <component :is="expandedRow === i ? ChevronUp : ChevronDown"
                        class="size-3 text-muted-foreground/50" />
                    </div>
                  </TableCell>

                  <!-- Dynamic field cells -->
                  <TableCell v-for="field in visibleFieldNames" :key="field" class="max-w-60">
                    <!-- Empty / missing — warn only if required -->
                    <template v-if="getCellDisplayType(entry[field], field) === 'empty'">
                      <span v-if="isFieldRequired(field)"
                        class="inline-flex items-center gap-1 text-[11px] text-status-warning">
                        <AlertTriangle class="size-3" />
                        {{ t['content-list.missing'] }}
                      </span>
                      <span v-else class="text-[11px] text-muted-foreground/40">—</span>
                    </template>

                    <!-- Boolean -->
                    <template v-else-if="getCellDisplayType(entry[field], field) === 'boolean'">
                      <div :class="cn(
                        'inline-flex h-5 w-9 items-center rounded-full px-0.5 transition-colors',
                        entry[field] ? 'bg-primary/20' : 'bg-muted',
                      )">
                        <div :class="cn(
                          'size-4 rounded-full shadow-sm transition-transform',
                          entry[field] ? 'translate-x-4 bg-primary' : 'translate-x-0 bg-muted-foreground/40',
                        )" />
                      </div>
                    </template>

                    <!-- Array -->
                    <template v-else-if="getCellDisplayType(entry[field], field) === 'array'">
                      <Badge variant="secondary" class="text-[10px]">
                        {{ (entry[field] as unknown[]).length }} {{ (entry[field] as unknown[]).length === 1 ? 'item' :
                          'items' }}
                      </Badge>
                    </template>

                    <!-- Number -->
                    <template v-else-if="getCellDisplayType(entry[field], field) === 'number'">
                      <span class="font-mono text-sm text-foreground tabular-nums text-right block">
                        {{ entry[field] }}
                      </span>
                    </template>

                    <!-- Date -->
                    <template v-else-if="getCellDisplayType(entry[field], field) === 'date'">
                      <div class="max-w-60">
                        <p class="truncate text-sm font-medium text-foreground">{{ formatDate(entry[field] as
                          string).title }}</p>
                        <p class="truncate text-[11px] text-muted-foreground">{{ formatDate(entry[field] as
                          string).subtitle }}</p>
                      </div>
                    </template>

                    <!-- Color -->
                    <template v-else-if="getCellDisplayType(entry[field], field) === 'color'">
                      <div class="flex items-center gap-2">
                        <span class="inline-block size-4 rounded border border-border shadow-sm"
                          :style="{ backgroundColor: String(entry[field]) }" />
                        <span class="font-mono text-xs text-muted-foreground">{{ entry[field] }}</span>
                      </div>
                    </template>

                    <!-- Markdown / Richtext -->
                    <template
                      v-else-if="getCellDisplayType(entry[field], field) === 'markdown' || getCellDisplayType(entry[field], field) === 'richtext'">
                      <Badge variant="outline" class="text-[10px]">
                        {{ getCellDisplayType(entry[field], field) === 'markdown' ? 'MD' : 'Rich' }}
                      </Badge>
                    </template>

                    <!-- Relation -->
                    <template v-else-if="getCellDisplayType(entry[field], field) === 'relation'">
                      <Badge variant="outline" class="text-[10px] font-mono">
                        {{ Array.isArray(entry[field]) ? `${(entry[field] as unknown[]).length} refs` : 'ref' }}
                      </Badge>
                    </template>

                    <!-- Text (default) -->
                    <template v-else>
                      <span class="block max-w-60 truncate text-sm text-foreground">
                        {{ truncate(entry[field], 60) }}
                      </span>
                    </template>
                  </TableCell>

                  <!-- Copy entry button -->
                  <TableCell class="w-10 text-center">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger as-child>
                          <Button variant="ghost" size="sm"
                            class="size-7 p-0 text-muted-foreground opacity-0 transition-all group-hover/row:opacity-100 hover:bg-accent hover:text-foreground"
                            @click.stop="copyEntry(entry)">
                            <component :is="copiedEntryId === (entry['id'] ?? i) ? Check : Copy" class="size-3.5"
                              :class="copiedEntryId === (entry['id'] ?? i) && 'text-status-success'" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="left">
                          <p class="text-xs">{{ copiedEntryId === (entry['id'] ?? i) ? 'Copied!' : 'Copy entry as JSON'
                            }}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </TableCell>
                </TableRow>

                <!-- Expanded detail row -->
                <TableRow v-if="expandedRow === i" class="bg-muted/30 hover:bg-muted/30">
                  <TableCell :colspan="visibleFieldNames.length + 2" class="p-0">
                    <div class="border-t border-border/50 px-6 py-5">
                      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        <div v-for="(val, key) in entry" :key="String(key)"
                          class="group/card flex flex-col gap-1 rounded-md border border-border/50 bg-background/50 px-3 py-2 overflow-hidden">
                          <div class="flex items-center gap-1.5">
                            <span class="font-mono text-[11px] font-medium text-muted-foreground">{{ key }}</span>
                            <Badge v-if="fieldTypeMap[String(key)]" variant="secondary" class="text-[8px] h-3.5 px-1">{{
                              fieldTypeMap[String(key)] }}</Badge>

                            <div
                              class="ml-auto flex items-center gap-1 opacity-0 group-hover/card:opacity-100 transition-opacity">
                              <!-- Copy button for ID -->
                              <Button v-if="String(key) === 'id'" variant="ghost" size="sm"
                                class="size-5 p-0 text-muted-foreground hover:bg-accent hover:text-foreground"
                                @click.stop="handleCopyId(String(val))">
                                <component :is="copiedId === String(val) ? Check : Copy" class="size-3"
                                  :class="copiedId === String(val) && 'text-status-success'" />
                              </Button>
                              <!-- Preview button for long content -->
                              <Button v-if="val != null && val !== '' && isLongContent(val, String(key))"
                                variant="ghost" size="sm"
                                class="size-5 p-0 text-muted-foreground hover:bg-accent hover:text-foreground"
                                @click.stop="openPreview(String(key), val)">
                                <Maximize2 class="size-3" />
                              </Button>
                            </div>
                          </div>

                          <!-- Type-aware value preview -->
                          <template v-if="val === undefined || val === null || val === ''">
                            <span v-if="isFieldRequired(String(key))"
                              class="inline-flex items-center gap-1 text-xs text-status-warning">
                              <AlertTriangle class="size-3" /> {{ t['content-list.required'] }}
                            </span>
                            <span v-else class="text-xs text-muted-foreground/40">—</span>
                          </template>

                          <!-- Boolean → switch visual -->
                          <template v-else-if="fieldTypeMap[String(key)] === 'boolean' || typeof val === 'boolean'">
                            <div class="flex items-center gap-2">
                              <div
                                :class="cn('h-5 w-9 rounded-full p-0.5 transition-colors', val ? 'bg-primary' : 'bg-muted')">
                                <div
                                  :class="cn('size-4 rounded-full bg-white shadow transition-transform', val ? 'translate-x-4' : 'translate-x-0')" />
                              </div>
                              <span class="text-xs text-muted-foreground">{{ val ? 'Yes' : 'No' }}</span>
                            </div>
                          </template>

                          <!-- Color → swatch + hex -->
                          <template v-else-if="fieldTypeMap[String(key)] === 'color'">
                            <div class="flex items-center gap-2">
                              <span class="size-6 rounded-md border border-border shadow-sm"
                                :style="{ backgroundColor: String(val) }" />
                              <span class="font-mono text-xs text-foreground">{{ val }}</span>
                            </div>
                          </template>

                          <!-- Rating → stars -->
                          <template v-else-if="fieldTypeMap[String(key)] === 'rating'">
                            <div class="flex items-center gap-0.5">
                              <span v-for="s in 5" :key="s"
                                :class="cn('text-base', s <= Number(val) ? 'text-amber-400' : 'text-muted/50')">★</span>
                              <span class="ml-1.5 text-xs text-muted-foreground">{{ val }}/5</span>
                            </div>
                          </template>

                          <!-- Percent → bar + number -->
                          <template v-else-if="fieldTypeMap[String(key)] === 'percent'">
                            <div class="flex items-center gap-2">
                              <div class="h-2 flex-1 rounded-full bg-muted overflow-hidden">
                                <div class="h-full rounded-full bg-primary transition-all"
                                  :style="{ width: `${Math.min(Number(val), 100)}%` }" />
                              </div>
                              <span class="text-xs font-medium text-foreground tabular-nums">{{ val }}%</span>
                            </div>
                          </template>

                          <!-- Email → mailto link -->
                          <template v-else-if="fieldTypeMap[String(key)] === 'email'">
                            <a :href="`mailto:${val}`"
                              class="inline-flex items-center gap-1.5 text-xs text-primary hover:underline" @click.stop>
                              {{ val }}
                            </a>
                          </template>

                          <!-- URL → clickable link -->
                          <template v-else-if="fieldTypeMap[String(key)] === 'url'">
                            <a :href="String(val)" target="_blank" rel="noopener"
                              class="inline-flex items-center gap-1.5 text-xs text-primary hover:underline truncate max-w-full"
                              @click.stop>
                              {{ String(val).replace(/^https?:\/\//, '') }}
                            </a>
                          </template>

                          <!-- Phone → tel link -->
                          <template v-else-if="fieldTypeMap[String(key)] === 'phone'">
                            <a :href="`tel:${val}`"
                              class="inline-flex items-center gap-1.5 text-xs text-primary hover:underline" @click.stop>
                              {{ val }}
                            </a>
                          </template>

                          <!-- Image → thumbnail -->
                          <template v-else-if="fieldTypeMap[String(key)] === 'image'">
                            <div class="flex items-center gap-2">
                              <div
                                class="flex size-10 items-center justify-center rounded-md border border-border bg-muted">
                                <img :src="String(val)" :alt="String(key)" class="size-10 rounded-md object-cover"
                                  @error="($event.target as HTMLImageElement).style.display = 'none'" />
                              </div>
                              <span class="text-xs text-muted-foreground truncate">{{ String(val).split('/').pop()
                                }}</span>
                            </div>
                          </template>

                          <!-- Video/File → icon + filename -->
                          <template
                            v-else-if="fieldTypeMap[String(key)] === 'video' || fieldTypeMap[String(key)] === 'file'">
                            <div class="flex items-center gap-2">
                              <Badge variant="outline" class="text-[10px] shrink-0">{{ fieldTypeMap[String(key)] ===
                                'video' ? '▶' : '📎' }} {{ String(val).split('.').pop()?.toUpperCase() }}</Badge>
                              <span class="text-xs text-muted-foreground truncate">{{ String(val).split('/').pop()
                                }}</span>
                            </div>
                          </template>

                          <!-- Relation → linked badge -->
                          <template v-else-if="fieldTypeMap[String(key)] === 'relation'">
                            <Badge variant="outline" class="text-[10px] font-mono gap-1">
                              🔗 {{ val }}
                            </Badge>
                          </template>

                          <!-- Relations → multiple badges -->
                          <template v-else-if="fieldTypeMap[String(key)] === 'relations' && Array.isArray(val)">
                            <div class="flex flex-wrap gap-1">
                              <Badge v-for="(ref, j) in (val as string[])" :key="j" variant="outline"
                                class="text-[10px] font-mono gap-1">
                                🔗 {{ ref }}
                              </Badge>
                            </div>
                          </template>

                          <!-- Array → tag badges -->
                          <template v-else-if="Array.isArray(val)">
                            <div class="flex flex-wrap gap-1">
                              <Badge v-for="(item, j) in (val as unknown[]).slice(0, 8)" :key="j" variant="outline"
                                class="text-[10px]">
                                {{ typeof item === 'string' ? item : JSON.stringify(item) }}
                              </Badge>
                              <Badge v-if="(val as unknown[]).length > 8" variant="secondary" class="text-[10px]">+{{
                                (val as unknown[]).length - 8 }}</Badge>
                            </div>
                          </template>

                          <!-- Select → styled badge -->
                          <template v-else-if="fieldTypeMap[String(key)] === 'select'">
                            <Badge variant="secondary" class="text-[10px] w-fit">{{ val }}</Badge>
                          </template>

                          <!-- Date / DateTime → formatted -->
                          <template
                            v-else-if="fieldTypeMap[String(key)] === 'date' || fieldTypeMap[String(key)] === 'datetime'">
                            <span class="text-xs text-foreground">
                              {{ formatDate(String(val)).title }}
                              <span v-if="fieldTypeMap[String(key)] === 'datetime'"
                                class="text-muted-foreground ml-1">{{ formatDate(String(val)).subtitle }}</span>
                            </span>
                          </template>

                          <!-- Slug → monospace with prefix -->
                          <template v-else-if="fieldTypeMap[String(key)] === 'slug'">
                            <span class="font-mono text-xs text-foreground">/{{ val }}</span>
                          </template>

                          <!-- Code → code block -->
                          <template v-else-if="fieldTypeMap[String(key)] === 'code'">
                            <code
                              class="line-clamp-2 rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">{{ val }}</code>
                          </template>

                          <!-- Markdown/Richtext → preview badge + truncate -->
                          <template
                            v-else-if="fieldTypeMap[String(key)] === 'markdown' || fieldTypeMap[String(key)] === 'richtext'">
                            <div class="flex items-center gap-2">
                              <Badge variant="secondary" class="text-[9px] shrink-0">{{ fieldTypeMap[String(key)] ===
                                'markdown' ? 'MD' : 'HTML' }}</Badge>
                              <span class="line-clamp-1 text-xs text-muted-foreground">{{ String(val).replace(/<[^>]*>/g, '').replace(/[#*`_\[\]]/g, '') }}</span>
                            </div>
                          </template>

                          <!-- Number types → formatted -->
                          <template
                            v-else-if="['number', 'integer', 'decimal'].includes(fieldTypeMap[String(key)] ?? '')">
                            <span class="font-mono text-xs font-medium text-foreground tabular-nums">{{ val }}</span>
                          </template>

                          <!-- Default fallback -->
                          <template v-else>
                            <span class="line-clamp-2 text-xs text-foreground">{{ typeof val === 'string' ? val :
                              JSON.stringify(val) }}</span>
                          </template>
                        </div>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              </template>
            </TableBody>
          </Table>
        </div>

        <!-- Pagination -->
        <div v-if="totalPages > 1 || totalEntries > 10"
          class="mt-4 flex items-center justify-between border-t border-border pt-4">
          <!-- Page size -->
          <div class="flex items-center gap-2">
            <span class="text-xs text-muted-foreground">{{ t['content-list.show'] }}</span>
            <Select :model-value="String(pageSize)"
              @update:model-value="(v: any) => { pageSize = Number(v); goToPage(1) }">
              <SelectTrigger size="sm" class="h-7 w-16 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="20">20</SelectItem>
                <SelectItem value="50">50</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <!-- Page navigation -->
          <div class="flex items-center gap-2">
            <Button variant="outline" size="sm" class="size-7 p-0" :disabled="currentPage <= 1"
              @click="goToPage(currentPage - 1)">
              <ChevronLeft class="size-4" />
            </Button>

            <div class="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span>{{ t['content-list.page'] }}</span>
              <input v-model="pageInputValue" type="text" inputmode="numeric"
                class="h-7 w-10 rounded-md border border-input bg-background text-center text-xs text-foreground outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50"
                @blur="handlePageInput" @keydown.enter="($event.target as HTMLInputElement).blur()">
                <span>of {{ totalPages }}</span>
            </div>

            <Button variant="outline" size="sm" class="size-7 p-0" :disabled="currentPage >= totalPages"
              @click="goToPage(currentPage + 1)">
              <ChevronRight class="size-4" />
            </Button>
          </div>

          <!-- Spacer to balance layout -->
          <div class="w-24" />
        </div>
      </template>

      <StudioHint :message="t['content-list.content-mutations-are-agent']"
        class="mt-4" />

      <!-- Preview Dialog -->
      <Dialog v-model:open="previewOpen">
        <DialogContent class="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle class="flex items-center gap-2">
              <span class="font-mono text-sm">{{ previewField }}</span>
              <Badge variant="secondary" class="text-[10px]">{{ previewType }}</Badge>
            </DialogTitle>
          </DialogHeader>
          <div class="flex-1 overflow-auto custom-scrollbar rounded-md border border-border bg-muted/30 p-4">
            <!-- Markdown preview -->
            <div v-if="previewType === 'markdown'" class="prose prose-sm dark:prose-invert max-w-none"
              v-html="renderMarkdown(String(previewValue))" />
            <!-- Rich text preview -->
            <div v-else-if="previewType === 'richtext'" class="prose prose-sm dark:prose-invert max-w-none"
              v-html="previewValue" />
            <!-- Code preview -->
            <pre v-else-if="previewType === 'code'" class="font-mono text-sm text-foreground whitespace-pre-wrap"><code>{{
          previewValue }}</code></pre>
            <!-- JSON/Object preview -->
            <pre v-else-if="typeof previewValue === 'object'"
              class="font-mono text-xs text-foreground whitespace-pre-wrap">
        <code>{{ JSON.stringify(previewValue, null, 2) }}</code></pre>
            <!-- Text preview -->
            <p v-else class="whitespace-pre-wrap font-mono text-sm text-foreground">{{ previewValue }}</p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  </div>
</template>

<style scoped>
input[type='text'][inputmode='numeric'] {
  -moz-appearance: textfield;
}

input[type='text'][inputmode='numeric']::-webkit-outer-spin-button,
input[type='text'][inputmode='numeric']::-webkit-inner-spin-button {
  -webkit-appearance: none;
}
</style>

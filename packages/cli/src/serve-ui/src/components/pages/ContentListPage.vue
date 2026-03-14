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
  Copy, Check, ChevronDown, ChevronUp, FileText,
} from 'lucide-vue-next'
import PageHeader from '@/components/layout/PageHeader.vue'
import StudioHint from '@/components/layout/StudioHint.vue'
import { Badge } from '@/components/ui/badge'
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
import { cn } from '@/lib/utils'

const route = useRoute()
const store = useContentStore()
const project = useProjectStore()

// --- Route params ---
const modelId = computed(() => route.params.modelId as string)

// --- Model info ---
const modelInfo = computed(() =>
  project.status?.models?.find(m => m.id === modelId.value),
)

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

// Compute field columns from data (exclude internal fields, show first fields)
const allFieldNames = computed(() => {
  if (rawEntries.value.length === 0) return []
  const first = rawEntries.value[0]
  if (!first || typeof first !== 'object') return []
  return Object.keys(first)
})

const visibleFieldNames = computed(() => {
  return allFieldNames.value.filter(k => !k.startsWith('_')).slice(0, 8)
})

// --- Model field type map from description ---
const fieldTypeMap = computed((): Record<string, string> => {
  const desc = store.modelDescription
  if (!desc?.fields) return {}
  const map: Record<string, string> = {}
  for (const [key, field] of Object.entries(desc.fields)) {
    map[key] = field.type
  }
  return map
})

// --- Actions ---
function load() {
  store.fetchContent(modelId.value, selectedLocale.value)
  store.fetchModelDescription(modelId.value)
}

function refresh() {
  expandedRow.value = null
  load()
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
    setTimeout(() => { copiedId.value = null }, 2000)
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
            <SelectValue placeholder="All locales" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All locales</SelectItem>
            <SelectItem v-for="loc in locales" :key="loc" :value="loc">
              {{ loc }}
            </SelectItem>
          </SelectContent>
        </Select>

        <!-- Refresh -->
        <Button variant="outline" size="sm" class="h-8" :disabled="store.loading" @click="refresh">
          <RefreshCw class="mr-1.5 size-3.5" :class="store.loading && 'animate-spin'" />
          Refresh
        </Button>
      </template>
    </PageHeader>

    <div class="flex flex-1 flex-col overflow-hidden px-6 py-4">
      <!-- Toolbar: search -->
      <div class="mb-4 flex items-center gap-3">
        <div :class="cn('relative transition-all duration-200', searchFocused || searchQuery ? 'w-72' : 'w-48')">
          <Search class="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input v-model="searchQuery" placeholder="Search entries..." class="h-8 pl-8 text-xs"
            @focus="searchFocused = true" @blur="searchFocused = false" />
        </div>
        <div class="flex-1" />
        <span class="text-xs text-muted-foreground">
          {{ totalEntries }} {{ totalEntries === 1 ? 'entry' : 'entries' }}
        </span>
      </div>

      <!-- Loading -->
      <div v-if="store.loading && rawEntries.length === 0" class="flex flex-1 items-center justify-center">
        <div class="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>

      <!-- Empty -->
      <div v-else-if="rawEntries.length === 0" class="flex flex-1 flex-col items-center justify-center text-center">
        <div class="mb-4 flex size-14 items-center justify-center rounded-full bg-muted">
          <FileText class="size-6 text-muted-foreground" />
        </div>
        <h2 class="text-lg font-semibold">No entries yet</h2>
        <p class="mt-2 max-w-sm text-sm text-muted-foreground">
          Create content using AI in your IDE.
        </p>
      </div>

      <!-- No search results -->
      <div v-else-if="filteredEntries.length === 0"
        class="flex flex-1 flex-col items-center justify-center text-center">
        <p class="text-sm text-muted-foreground">
          No entries matching "{{ searchQuery }}"
        </p>
      </div>

      <!-- Data table -->
      <template v-else>
        <div class="flex-1 overflow-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow class="hover:bg-transparent">
                <TableHead class="w-10 text-center text-[11px] font-medium text-muted-foreground">#</TableHead>
                <TableHead v-for="field in visibleFieldNames" :key="field"
                  class="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  {{ field }}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <template v-for="(entry, i) in paginatedEntries" :key="i">
                <!-- Data row -->
                <TableRow :class="cn(
                  'cursor-pointer transition-colors',
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
                    <!-- Empty / missing -->
                    <template v-if="getCellDisplayType(entry[field], field) === 'empty'">
                      <span class="inline-flex items-center gap-1 text-[11px] text-status-warning">
                        <AlertTriangle class="size-3" />
                        missing
                      </span>
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
                </TableRow>

                <!-- Expanded detail row -->
                <TableRow v-if="expandedRow === i" class="bg-muted/30 hover:bg-muted/30">
                  <TableCell :colspan="visibleFieldNames.length + 1" class="p-0">
                    <div class="border-t border-border/50 px-6 py-5">
                      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        <div v-for="(val, key) in entry" :key="String(key)"
                          class="flex flex-col gap-0.5 rounded-md border border-border/50 bg-background/50 px-3 py-2">
                          <div class="flex items-center gap-2">
                            <span class="font-mono text-[11px] font-medium text-muted-foreground">{{ key }}</span>

                            <!-- Copy button for ID field -->
                            <TooltipProvider v-if="String(key) === 'id' || String(key) === 'ID'">
                              <Tooltip>
                                <TooltipTrigger as-child>
                                  <button
                                    class="inline-flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
                                    @click.stop="handleCopyId(String(val))">
                                    <component :is="copiedId === String(val) ? Check : Copy" class="size-3"
                                      :class="copiedId === String(val) && 'text-status-success'" />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p class="text-xs">{{ copiedId === String(val) ? 'Copied!' : 'Copy ID' }}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>

                          <!-- Value display -->
                          <template v-if="val === undefined || val === null || val === ''">
                            <span class="inline-flex items-center gap-1 text-xs text-status-warning">
                              <AlertTriangle class="size-3" />
                              empty
                            </span>
                          </template>
                          <template v-else-if="typeof val === 'boolean'">
                            <Badge :variant="val ? 'default' : 'secondary'" class="w-fit text-[10px]">
                              {{ val ? 'true' : 'false' }}
                            </Badge>
                          </template>
                          <template
                            v-else-if="(String(key) === 'createdAt' || String(key) === 'updatedAt') && typeof val === 'string'">
                            <span class="text-xs text-foreground">
                              {{ formatDate(val).title }} <span class="text-muted-foreground">{{
                                formatDate(val).subtitle }}</span>
                            </span>
                          </template>
                          <template v-else>
                            <span class="break-all font-mono text-xs text-foreground">
                              {{ typeof val === 'string' ? val : JSON.stringify(val) }}
                            </span>
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
            <span class="text-xs text-muted-foreground">Show</span>
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
              <span>Page</span>
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

      <StudioHint id="content" message="Edit content with AI chat in Contentrain Studio." class="mt-4" />
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

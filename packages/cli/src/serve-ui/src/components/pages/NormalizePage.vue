<script setup lang="ts">
import { ref, computed } from 'vue'
import { useApi } from '@/composables/useApi'
import {
  ScanSearch, FileCode, Sparkles, RefreshCw,
  FileText, BarChart3, Languages, CheckCircle2,
  ChevronDown, FolderTree, Filter, X,
} from 'lucide-vue-next'
import PageHeader from '@/components/layout/PageHeader.vue'
import StudioHint from '@/components/layout/StudioHint.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { TreeSelect, type TreeNode } from '@/components/ui/tree-select'
import { cn } from '@/lib/utils'

const api = useApi()

// --- Types ---
interface Candidate {
  file: string
  line: number
  column?: number
  value: string
  context?: string
  surrounding?: string
  confidence: number
}

interface ScanSummary {
  mode: 'summary'
  total_files: number
  total_candidates_estimate: number
  by_directory: Record<string, { files: number; candidates: number }>
}

interface ScanCandidates {
  mode: 'candidates'
  candidates: Candidate[]
  duplicates?: Array<{ value: string; count: number; files: string[] }>
  stats: { total_scanned: number; candidates_found: number; total_files: number; has_more: boolean }
}

type ScanResult = ScanSummary | ScanCandidates

// --- State ---
const scanResult = ref<ScanResult | null>(null)
const loading = ref(false)
const scanError = ref<string | null>(null)
const activeTab = ref('scan')

// Scan config
const scanPaths = ref<Set<string>>(new Set())
const scanLimit = ref(30)

// File tree
const fileTree = ref<TreeNode[]>([])
const treeLoading = ref(false)

async function loadTree() {
  treeLoading.value = true
  try {
    const result = await api.get<{ tree: TreeNode[] }>('/tree')
    fileTree.value = result.tree
  } catch { /* ignore */ }
  finally { treeLoading.value = false }
}

function togglePath(path: string) {
  if (scanPaths.value.has(path)) {
    scanPaths.value.delete(path)
  } else {
    scanPaths.value.add(path)
  }
}

function clearPaths() { scanPaths.value.clear() }

const selectedPathsList = computed(() => [...scanPaths.value])

// --- Computed ---
const summary = computed(() => scanResult.value?.mode === 'summary' ? scanResult.value as ScanSummary : null)
const candidates = computed(() => scanResult.value?.mode === 'candidates' ? scanResult.value as ScanCandidates : null)

const candidatesByFile = computed(() => {
  if (!candidates.value?.candidates) return []
  const groups = new Map<string, Candidate[]>()
  for (const c of candidates.value.candidates) {
    const existing = groups.get(c.file) ?? []
    existing.push(c)
    groups.set(c.file, existing)
  }
  return [...groups.entries()]
    .map(([file, items]) => ({ file, candidates: items.toSorted((a, b) => a.line - b.line) }))
    .toSorted((a, b) => b.candidates.length - a.candidates.length)
})

const sortedDirectories = computed(() => {
  if (!summary.value?.by_directory) return []
  return Object.entries(summary.value.by_directory)
    .map(([dir, data]) => (Object.assign({dir}, data)))
    .toSorted((a, b) => b.candidates - a.candidates)
    .slice(0, 20)
})

// --- Actions ---
async function runScan(mode: 'summary' | 'candidates', overridePath?: string) {
  loading.value = true
  scanError.value = null
  try {
    const params = new URLSearchParams({ mode, limit: String(scanLimit.value) })
    const paths = overridePath ? overridePath : selectedPathsList.value.join(',')
    if (paths) params.set('paths', paths)
    scanResult.value = await api.get<ScanResult>(`/normalize/scan?${params}`)
    activeTab.value = 'results'
  } catch (e) {
    scanError.value = e instanceof Error ? e.message : 'Scan failed'
  } finally {
    loading.value = false
  }
}

function confidenceColor(confidence: number): string {
  if (confidence >= 0.9) return 'text-status-success bg-status-success/10'
  if (confidence >= 0.7) return 'text-status-warning bg-status-warning/10'
  return 'text-muted-foreground bg-muted'
}
</script>

<template>
  <div>
    <PageHeader title="Normalize" description="Scan and extract hardcoded strings">
      <template #actions>
        <Button variant="outline" size="sm" :disabled="loading" @click="runScan('summary')">
          <BarChart3 class="size-4" /> Summary
        </Button>
        <Button variant="default" size="sm" :disabled="loading" @click="runScan('candidates')">
          <ScanSearch class="size-4" :class="loading && 'animate-spin'" />
          {{ loading ? 'Scanning...' : 'Scan' }}
        </Button>
      </template>
    </PageHeader>

    <div class="px-6 py-6 space-y-6">
      <!-- Scan config bar -->
      <div class="flex items-center gap-3 flex-wrap">
        <!-- Path selector -->
        <Popover>
          <PopoverTrigger as-child>
            <Button variant="outline" size="sm" class="h-9 gap-1.5 text-xs" @click="fileTree.length === 0 && loadTree()">
              <FolderTree class="size-3.5" />
              {{ scanPaths.size > 0 ? `${scanPaths.size} selected` : 'Select paths' }}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" class="w-105 p-0" :side-offset="8">
            <div class="flex items-center justify-between border-b border-border px-3 py-2">
              <span class="text-xs font-medium">Select scan targets</span>
              <div class="flex gap-1">
                <button v-if="scanPaths.size > 0" class="text-[10px] text-destructive hover:underline" @click="clearPaths">Clear</button>
              </div>
            </div>
            <div v-if="treeLoading" class="flex justify-center py-8">
              <div class="size-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
            <TreeSelect v-else :nodes="fileTree" :selected="scanPaths" @toggle="togglePath" />
          </PopoverContent>
        </Popover>

        <!-- Selected paths badges -->
        <div v-if="scanPaths.size > 0" class="flex items-center gap-1 flex-wrap flex-1">
          <Badge v-for="p in selectedPathsList" :key="p" variant="secondary" class="text-[10px] gap-1 pr-1">
            {{ p }}
            <button class="rounded-full hover:bg-accent p-0.5" @click="togglePath(p)"><X class="size-2.5" /></button>
          </Badge>
        </div>
        <span v-else class="text-xs text-muted-foreground flex-1">Auto-detect all scannable files</span>

        <!-- Limit -->
        <div class="flex items-center gap-2">
          <Filter class="size-3.5 text-muted-foreground" />
          <select v-model.number="scanLimit" class="h-9 rounded-md border border-input bg-background px-2 text-xs">
            <option :value="10">10 results</option>
            <option :value="30">30 results</option>
            <option :value="50">50 results</option>
            <option :value="100">100 results</option>
          </select>
        </div>
      </div>

      <!-- Error -->
      <div v-if="scanError" class="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
        {{ scanError }}
      </div>

      <!-- Loading -->
      <div v-if="loading" class="flex flex-col items-center py-12 gap-3">
        <div class="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p class="text-sm text-muted-foreground">Scanning source files...</p>
      </div>

      <!-- No results yet -->
      <template v-else-if="!scanResult">
        <div class="flex flex-col items-center py-12 text-center">
          <img src="/select-data-type.svg" alt="" class="empty-illustration mb-6" />
          <h2 class="text-xl font-semibold">Extract hardcoded strings</h2>
          <p class="mt-2 max-w-md text-sm text-muted-foreground">
            Click <strong>Scan</strong> to find hardcoded strings in your source files,
            or <strong>Summary</strong> for a quick overview.
          </p>
        </div>

        <!-- How it works -->
        <Card class="mx-auto max-w-2xl">
          <CardHeader class="pb-3">
            <CardTitle class="text-sm font-medium flex items-center gap-2">
              <Sparkles class="size-4 text-primary" />
              How it works
            </CardTitle>
          </CardHeader>
          <Separator />
          <CardContent class="pt-4">
            <div class="space-y-4">
              <div v-for="(step, i) in [
                { title: 'Scan', desc: 'Finds hardcoded strings in .vue, .tsx, .jsx, .astro, .svelte files' },
                { title: 'Extract', desc: 'Creates content models and entries from discovered strings' },
                { title: 'Patch', desc: 'Replaces hardcoded strings with content references in source' },
                { title: 'Review', desc: 'Changes appear as branches — approve or reject from Branches page' },
              ]" :key="i" class="flex items-start gap-4">
                <Badge variant="secondary" class="mt-0.5 shrink-0 size-7 flex items-center justify-center rounded-full font-mono text-xs">{{ i + 1 }}</Badge>
                <div>
                  <p class="text-sm font-medium">{{ step.title }}</p>
                  <p class="text-xs text-muted-foreground mt-0.5">{{ step.desc }}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </template>

      <!-- Summary results -->
      <template v-else-if="summary">
        <div class="grid grid-cols-2 gap-4 md:grid-cols-3">
          <Card>
            <CardContent class="flex items-center gap-3 p-4">
              <div class="flex size-10 items-center justify-center rounded-lg bg-muted">
                <FileText class="size-5 text-muted-foreground" />
              </div>
              <div>
                <div class="text-2xl font-bold tabular-nums">{{ summary.total_files }}</div>
                <div class="text-xs text-muted-foreground">Files scanned</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent class="flex items-center gap-3 p-4">
              <div class="flex size-10 items-center justify-center rounded-lg bg-status-warning/10">
                <Languages class="size-5 text-status-warning" />
              </div>
              <div>
                <div class="text-2xl font-bold tabular-nums">{{ summary.total_candidates_estimate }}</div>
                <div class="text-xs text-muted-foreground">Candidates estimated</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent class="flex items-center gap-3 p-4">
              <div class="flex size-10 items-center justify-center rounded-lg bg-status-info/10">
                <BarChart3 class="size-5 text-status-info" />
              </div>
              <div>
                <div class="text-2xl font-bold tabular-nums">{{ sortedDirectories.length }}</div>
                <div class="text-xs text-muted-foreground">Directories with strings</div>
              </div>
            </CardContent>
          </Card>
        </div>

        <!-- Directory breakdown -->
        <div class="space-y-2">
          <h3 class="text-sm font-medium text-muted-foreground">By directory</h3>
          <div class="rounded-lg border border-border overflow-hidden">
            <div
              v-for="dir in sortedDirectories"
              :key="dir.dir"
              class="flex items-center gap-3 border-b border-border last:border-0 px-4 py-2.5 hover:bg-muted/30"
            >
              <FileCode class="size-4 text-muted-foreground shrink-0" />
              <span class="flex-1 font-mono text-xs truncate">{{ dir.dir }}</span>
              <Badge variant="secondary" class="text-[10px]">{{ dir.files }} files</Badge>
              <Badge variant="outline" class="text-[10px] font-mono">{{ dir.candidates }} strings</Badge>
              <Button
                variant="ghost"
                size="sm"
                class="h-7 text-xs"
                @click="runScan('candidates', dir.dir)"
              >
                Scan →
              </Button>
            </div>
          </div>
        </div>
      </template>

      <!-- Candidates results -->
      <template v-else-if="candidates">
        <div class="grid grid-cols-3 gap-3">
          <Card>
            <CardContent class="flex items-center gap-3 p-4">
              <div class="flex size-10 items-center justify-center rounded-lg bg-muted">
                <FileText class="size-5 text-muted-foreground" />
              </div>
              <div>
                <div class="text-2xl font-bold tabular-nums">{{ candidates.stats.total_files }}</div>
                <div class="text-xs text-muted-foreground">Files scanned</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent class="flex items-center gap-3 p-4">
              <div class="flex size-10 items-center justify-center rounded-lg bg-status-warning/10">
                <Languages class="size-5 text-status-warning" />
              </div>
              <div>
                <div class="text-2xl font-bold tabular-nums">{{ candidates.stats.candidates_found }}</div>
                <div class="text-xs text-muted-foreground">Candidates found</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent class="flex items-center gap-3 p-4">
              <div class="flex size-10 items-center justify-center rounded-lg bg-status-info/10">
                <BarChart3 class="size-5 text-status-info" />
              </div>
              <div>
                <div class="text-2xl font-bold tabular-nums">{{ candidates.stats.total_scanned }}</div>
                <div class="text-xs text-muted-foreground">Total analyzed</div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div v-if="candidates.stats.has_more" class="flex items-center gap-2 rounded-lg border border-status-info/20 bg-status-info/5 p-3 text-sm text-status-info">
          <BarChart3 class="size-4 shrink-0" />
          More results available. Increase the limit or narrow the path to see more.
        </div>

        <!-- No candidates -->
        <div v-if="candidatesByFile.length === 0" class="flex flex-col items-center py-12 text-center">
          <div class="flex size-16 items-center justify-center rounded-full bg-status-success/10 mb-4">
            <CheckCircle2 class="size-8 text-status-success" />
          </div>
          <h2 class="text-lg font-semibold">No hardcoded strings found</h2>
          <p class="mt-2 text-sm text-muted-foreground">Your project looks clean.</p>
        </div>

        <!-- Candidates by file -->
        <div v-else class="space-y-3">
          <h3 class="text-sm font-medium text-muted-foreground">
            {{ candidatesByFile.length }} files with candidates
          </h3>

          <Collapsible v-for="group in candidatesByFile" :key="group.file" :default-open="candidatesByFile.length <= 5">
            <Card class="overflow-hidden">
              <CollapsibleTrigger class="flex w-full items-center gap-3 p-3 hover:bg-muted/50 transition-colors text-left">
                <FileCode class="size-4 text-muted-foreground shrink-0" />
                <span class="font-mono text-xs text-foreground flex-1 truncate">{{ group.file }}</span>
                <Badge variant="secondary" class="text-[10px]">{{ group.candidates.length }}</Badge>
                <ChevronDown class="size-3.5 text-muted-foreground shrink-0 transition-transform [[data-state=open]>&]:rotate-180" />
              </CollapsibleTrigger>

              <CollapsibleContent>
                <Separator />
                <div class="divide-y divide-border">
                  <div v-for="(c, ci) in group.candidates" :key="ci" class="flex items-start gap-3 p-3 bg-card">
                    <span class="font-mono text-[10px] text-muted-foreground mt-1 w-10 text-right shrink-0 tabular-nums">
                      L{{ c.line }}
                    </span>
                    <div class="flex-1 min-w-0">
                      <span class="text-sm text-foreground break-all">"{{ c.value }}"</span>
                      <p v-if="c.surrounding" class="mt-1 font-mono text-[10px] text-muted-foreground truncate">
                        {{ c.surrounding }}
                      </p>
                    </div>
                    <Badge :class="confidenceColor(c.confidence)" class="text-[10px] shrink-0 font-mono">
                      {{ Math.round(c.confidence * 100) }}%
                    </Badge>
                  </div>
                </div>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        </div>

        <!-- Duplicates -->
        <div v-if="candidates.duplicates && candidates.duplicates.length > 0" class="space-y-3">
          <h3 class="text-sm font-medium text-muted-foreground">Duplicate strings</h3>
          <Card>
            <div class="divide-y divide-border">
              <div v-for="(dup, di) in candidates.duplicates" :key="di" class="flex items-start gap-3 p-3">
                <ScanSearch class="size-4 text-status-warning mt-0.5 shrink-0" />
                <div class="flex-1 min-w-0">
                  <span class="text-sm font-medium text-foreground">"{{ dup.value }}"</span>
                  <div class="mt-1 flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" class="text-[10px]">{{ dup.count }}x</Badge>
                    <span v-for="f in dup.files" :key="f" class="font-mono text-[10px] text-muted-foreground">{{ f }}</span>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </template>

      <StudioHint id="normalize" message="Track normalize history and manage extractions in Contentrain Studio." class="mt-6" />
    </div>
  </div>
</template>

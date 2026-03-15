<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useApi } from '@/composables/useApi'
import { useWatch } from '@/composables/useWatch'
import { useContentStore, type NormalizePlan, type NormalizePlanModel } from '@/stores/content'
import { formatRelativeTime } from '@/composables/useFormatters'
import {
  ScanSearch, FileCode, Sparkles, RefreshCw,
  FileText, BarChart3, Languages, CheckCircle2,
  ChevronDown, FolderTree, Filter, X,
  Bot, Layers, ArrowRight, Trash2,
} from 'lucide-vue-next'
import PageHeader from '@/components/layout/PageHeader.vue'
import StudioHint from '@/components/layout/StudioHint.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { TreeSelect, type TreeNode } from '@/components/ui/tree-select'

const api = useApi()
const router = useRouter()
const store = useContentStore()

// --- Scan Types ---
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

interface NormalizeResults {
  lastOperation: {
    tool?: string
    target?: string
    timestamp?: string
  } | null
  pendingBranches: Array<{ name: string }>
}

// --- State ---
const scanResult = ref<ScanResult | null>(null)
const loading = ref(false)
const scanError = ref<string | null>(null)
const mainTab = ref('plan')
const normalizeResults = ref<NormalizeResults | null>(null)
const resultsLoading = ref(false)
const resultsError = ref<string | null>(null)
const approvingBranch = ref<string | null>(null)
const planLoading = ref(false)
const planError = ref<string | null>(null)
const planApproving = ref(false)
const planRejecting = ref(false)
const selectedModels = ref<Set<string>>(new Set())

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

// --- Plan ---
const plan = computed(() => store.normalizePlan)
const hasPlan = computed(() => plan.value !== null)

// Auto-select tab based on plan availability
const activeTab = computed({
  get: () => hasPlan.value ? mainTab.value : 'scan',
  set: (v: string) => { mainTab.value = v },
})

// Model selection
function toggleModelSelection(modelId: string) {
  if (selectedModels.value.has(modelId)) {
    selectedModels.value.delete(modelId)
  } else {
    selectedModels.value.add(modelId)
  }
}

function selectAllModels() {
  if (!plan.value?.models) return
  for (const m of plan.value.models) {
    selectedModels.value.add(m.id)
  }
}

function deselectAllModels() {
  selectedModels.value.clear()
}

const allModelsSelected = computed(() => {
  if (!plan.value?.models?.length) return false
  return plan.value.models.every(m => selectedModels.value.has(m.id))
})

// Extractions grouped by model
const extractionsByModel = computed(() => {
  if (!plan.value?.extractions) return []
  const groups = new Map<string, typeof plan.value.extractions>()
  for (const ext of plan.value.extractions) {
    const existing = groups.get(ext.model) ?? []
    existing.push(ext)
    groups.set(ext.model, existing)
  }
  return [...groups.entries()]
    .map(([model, items]) => ({ model, extractions: items }))
    .toSorted((a, b) => b.extractions.length - a.extractions.length)
})

// Patches grouped by file
const patchesByFile = computed(() => {
  if (!plan.value?.patches) return []
  const groups = new Map<string, typeof plan.value.patches>()
  for (const patch of plan.value.patches) {
    const existing = groups.get(patch.file) ?? []
    existing.push(patch)
    groups.set(patch.file, existing)
  }
  return [...groups.entries()]
    .map(([file, items]) => ({ file, patches: items.toSorted((a, b) => a.line - b.line) }))
    .toSorted((a, b) => b.patches.length - a.patches.length)
})

function modelKindColor(kind: string): string {
  switch (kind) {
    case 'singleton': return 'text-purple-600 bg-purple-100 dark:text-purple-400 dark:bg-purple-900/30'
    case 'collection': return 'text-blue-600 bg-blue-100 dark:text-blue-400 dark:bg-blue-900/30'
    case 'dictionary': return 'text-amber-600 bg-amber-100 dark:text-amber-400 dark:bg-amber-900/30'
    case 'component': return 'text-green-600 bg-green-100 dark:text-green-400 dark:bg-green-900/30'
    default: return 'text-muted-foreground bg-muted'
  }
}

// --- Scan Computed ---
const summary = computed(() => scanResult.value?.mode === 'summary' ? scanResult.value as ScanSummary : null)
const candidates = computed(() => scanResult.value?.mode === 'candidates' ? scanResult.value as ScanCandidates : null)
const pendingBranches = computed(() => normalizeResults.value?.pendingBranches ?? [])

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
    .map(([dir, data]) => (Object.assign({ dir }, data)))
    .toSorted((a, b) => b.candidates - a.candidates)
    .slice(0, 20)
})

// --- Actions ---
async function loadNormalizeResults() {
  resultsLoading.value = true
  resultsError.value = null
  try {
    normalizeResults.value = await api.get<NormalizeResults>('/normalize/results')
  } catch (e) {
    resultsError.value = e instanceof Error ? e.message : 'Failed to load normalize results'
  } finally {
    resultsLoading.value = false
  }
}

async function loadPlan() {
  planLoading.value = true
  planError.value = null
  try {
    await store.fetchNormalizePlan()
    // Auto-select all models when plan loads
    if (store.normalizePlan?.models) {
      selectedModels.value = new Set(store.normalizePlan.models.map(m => m.id))
    }
  } catch (e) {
    planError.value = e instanceof Error ? e.message : 'Failed to load plan'
  } finally {
    planLoading.value = false
  }
}

async function approvePlan() {
  planApproving.value = true
  planError.value = null
  try {
    const models = selectedModels.value.size > 0 ? [...selectedModels.value] : undefined
    await api.post('/normalize/plan/approve', { models })
    await loadPlan()
    await loadNormalizeResults()
  } catch (e) {
    planError.value = e instanceof Error ? e.message : 'Failed to approve plan'
  } finally {
    planApproving.value = false
  }
}

async function rejectPlan() {
  planRejecting.value = true
  planError.value = null
  try {
    await api.post('/normalize/plan/reject')
    await loadPlan()
  } catch (e) {
    planError.value = e instanceof Error ? e.message : 'Failed to reject plan'
  } finally {
    planRejecting.value = false
  }
}

async function runScan(mode: 'summary' | 'candidates', overridePath?: string) {
  loading.value = true
  scanError.value = null
  try {
    const params = new URLSearchParams({ mode, limit: String(scanLimit.value) })
    const paths = overridePath ? overridePath : selectedPathsList.value.join(',')
    if (paths) params.set('paths', paths)
    scanResult.value = await api.get<ScanResult>(`/normalize/scan?${params}`)
    activeTab.value = 'scan'
  } catch (e) {
    scanError.value = e instanceof Error ? e.message : 'Scan failed'
  } finally {
    loading.value = false
  }
}

async function approveNormalizeBranch(branchName: string) {
  approvingBranch.value = branchName
  resultsError.value = null
  try {
    await api.post('/normalize/approve', { branch: branchName })
    await loadNormalizeResults()
  } catch (e) {
    resultsError.value = e instanceof Error ? e.message : 'Failed to approve normalize branch'
  } finally {
    approvingBranch.value = null
  }
}

function reviewBranch(branchName: string) {
  router.push(`/branches/${encodeURIComponent(branchName)}`)
}

function confidenceColor(confidence: number): string {
  if (confidence >= 0.9) return 'text-status-success bg-status-success/10'
  if (confidence >= 0.7) return 'text-status-warning bg-status-warning/10'
  return 'text-muted-foreground bg-muted'
}

function fieldCount(model: NormalizePlanModel): number {
  return Object.keys(model.fields).length
}

useWatch((event) => {
  if (event.type === 'normalize:plan-updated') {
    void loadPlan()
  }
  if (event.type === 'branch:created' || event.type === 'branch:merged' || event.type === 'context:changed') {
    void loadNormalizeResults()
  }
})

onMounted(() => {
  void loadPlan()
  void loadNormalizeResults()
})
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
      <!-- Plan banner -->
      <div v-if="hasPlan && plan" class="rounded-lg border border-primary/30 bg-primary/5 p-4">
        <div class="flex items-center gap-3">
          <div class="flex size-10 items-center justify-center rounded-lg bg-primary/10">
            <Bot class="size-5 text-primary" />
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-semibold text-foreground">Normalize plan ready</p>
            <p class="text-xs text-muted-foreground">
              Created by <span class="font-medium text-foreground">{{ plan.agent }}</span>
              <span v-if="plan.created_at"> &middot; {{ formatRelativeTime(plan.created_at) }}</span>
            </p>
          </div>
          <Badge variant="secondary" class="text-xs">{{ plan.status }}</Badge>
        </div>
      </div>

      <!-- Tabs: Plan | Scan Explorer -->
      <Tabs v-model="activeTab">
        <TabsList v-if="hasPlan" class="grid w-full grid-cols-2 max-w-sm">
          <TabsTrigger value="plan">Plan</TabsTrigger>
          <TabsTrigger value="scan">Scan Explorer</TabsTrigger>
        </TabsList>

        <!-- ===================== PLAN TAB ===================== -->
        <TabsContent value="plan" class="space-y-6 mt-4">
          <!-- Plan loading -->
          <div v-if="planLoading" class="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
            <RefreshCw class="size-4 animate-spin" />
            Loading plan...
          </div>

          <!-- No plan state -->
          <template v-else-if="!plan">
            <!-- Review queue for pending branches -->
            <div class="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <Card>
                <CardHeader class="pb-3">
                  <CardTitle class="text-sm font-medium flex items-center gap-2">
                    <Sparkles class="size-4 text-primary" />
                    Normalize Review Queue
                  </CardTitle>
                </CardHeader>
                <Separator />
                <CardContent class="pt-4">
                  <div v-if="resultsLoading" class="flex items-center gap-2 text-sm text-muted-foreground">
                    <RefreshCw class="size-4 animate-spin" />
                    Loading normalize results...
                  </div>
                  <div v-else-if="pendingBranches.length > 0" class="space-y-3">
                    <div
                      v-for="branch in pendingBranches"
                      :key="branch.name"
                      class="flex items-center gap-3 rounded-lg border border-border bg-card p-3"
                    >
                      <div class="min-w-0 flex-1">
                        <p class="text-sm font-medium text-foreground truncate">{{ branch.name.replace('contentrain/', '') }}</p>
                        <p class="font-mono text-[10px] text-muted-foreground truncate">{{ branch.name }}</p>
                      </div>
                      <Button variant="outline" size="sm" class="h-8 text-xs" @click="reviewBranch(branch.name)">
                        Review Diff
                      </Button>
                      <Button
                        variant="default"
                        size="sm"
                        class="h-8 text-xs"
                        :disabled="approvingBranch === branch.name"
                        @click="approveNormalizeBranch(branch.name)"
                      >
                        {{ approvingBranch === branch.name ? 'Approving...' : 'Approve' }}
                      </Button>
                    </div>
                  </div>
                  <div v-else class="rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
                    No pending normalize branches.
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader class="pb-3">
                  <CardTitle class="text-sm font-medium flex items-center gap-2">
                    <BarChart3 class="size-4 text-status-info" />
                    Last Normalize Activity
                  </CardTitle>
                </CardHeader>
                <Separator />
                <CardContent class="pt-4">
                  <div v-if="normalizeResults?.lastOperation" class="space-y-2 text-sm">
                    <div>
                      <p class="text-xs text-muted-foreground">Tool</p>
                      <p class="font-medium text-foreground">{{ normalizeResults.lastOperation.tool ?? 'unknown' }}</p>
                    </div>
                    <div v-if="normalizeResults.lastOperation.target">
                      <p class="text-xs text-muted-foreground">Target</p>
                      <p class="font-mono text-xs text-foreground break-all">{{ normalizeResults.lastOperation.target }}</p>
                    </div>
                    <div v-if="normalizeResults.lastOperation.timestamp">
                      <p class="text-xs text-muted-foreground">Updated</p>
                      <p class="text-foreground">{{ formatRelativeTime(normalizeResults.lastOperation.timestamp) }}</p>
                    </div>
                  </div>
                  <div v-else class="text-sm text-muted-foreground">
                    No normalize activity found yet.
                  </div>
                </CardContent>
              </Card>
            </div>

            <!-- Empty state with how-it-works -->
            <div class="flex flex-col items-center py-12 text-center">
              <img src="/select-data-type.svg" alt="" class="empty-illustration mb-6" />
              <h2 class="text-xl font-semibold">Extract hardcoded strings</h2>
              <p class="mt-2 max-w-md text-sm text-muted-foreground">
                Ask your AI agent to normalize your project. The agent will scan, analyze, and
                create a plan that appears here for your review.
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
                    { title: 'Agent Scans', desc: 'AI agent calls MCP scan to find hardcoded strings in your source files' },
                    { title: 'Agent Plans', desc: 'Agent analyzes results, proposes models, and writes a normalize plan' },
                    { title: 'You Review', desc: 'Plan appears here with proposed models, extractions, and source patches' },
                    { title: 'You Approve', desc: 'Approve the plan and changes are applied as a reviewable branch' },
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

          <!-- Plan available -->
          <template v-else>
            <!-- Plan error -->
            <div v-if="planError" class="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
              {{ planError }}
            </div>

            <!-- Plan stats -->
            <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Card>
                <CardContent class="flex items-center gap-3 p-4">
                  <div class="flex size-10 items-center justify-center rounded-lg bg-muted">
                    <FileText class="size-5 text-muted-foreground" />
                  </div>
                  <div>
                    <div class="text-2xl font-bold tabular-nums">{{ plan.scan_stats.files_scanned }}</div>
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
                    <div class="text-2xl font-bold tabular-nums">{{ plan.scan_stats.extracted }}</div>
                    <div class="text-xs text-muted-foreground">Strings extracted</div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent class="flex items-center gap-3 p-4">
                  <div class="flex size-10 items-center justify-center rounded-lg bg-primary/10">
                    <Layers class="size-5 text-primary" />
                  </div>
                  <div>
                    <div class="text-2xl font-bold tabular-nums">{{ plan.models.length }}</div>
                    <div class="text-xs text-muted-foreground">Models proposed</div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent class="flex items-center gap-3 p-4">
                  <div class="flex size-10 items-center justify-center rounded-lg bg-status-info/10">
                    <BarChart3 class="size-5 text-status-info" />
                  </div>
                  <div>
                    <div class="text-2xl font-bold tabular-nums">{{ plan.scan_stats.skipped }}</div>
                    <div class="text-xs text-muted-foreground">Strings skipped</div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <!-- Proposed Models -->
            <div class="space-y-3">
              <div class="flex items-center justify-between">
                <h3 class="text-sm font-medium text-muted-foreground">Proposed Models</h3>
                <div class="flex items-center gap-2">
                  <button
                    class="text-xs text-primary hover:underline"
                    @click="allModelsSelected ? deselectAllModels() : selectAllModels()"
                  >
                    {{ allModelsSelected ? 'Deselect all' : 'Select all' }}
                  </button>
                </div>
              </div>
              <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Card
                  v-for="model in plan.models"
                  :key="model.id"
                  class="cursor-pointer transition-colors"
                  :class="selectedModels.has(model.id) ? 'border-primary/50 bg-primary/5' : 'hover:border-border/80'"
                  @click="toggleModelSelection(model.id)"
                >
                  <CardContent class="p-4 space-y-3">
                    <div class="flex items-center gap-2">
                      <input
                        type="checkbox"
                        :checked="selectedModels.has(model.id)"
                        class="size-4 rounded border-input"
                        @click.stop
                        @change="toggleModelSelection(model.id)"
                      />
                      <span class="text-sm font-semibold text-foreground flex-1 truncate">{{ model.id }}</span>
                    </div>
                    <div class="flex items-center gap-2 flex-wrap">
                      <Badge :class="modelKindColor(model.kind)" class="text-[10px]">{{ model.kind }}</Badge>
                      <Badge variant="outline" class="text-[10px]">{{ model.domain }}</Badge>
                      <Badge v-if="model.i18n" variant="secondary" class="text-[10px]">i18n</Badge>
                    </div>
                    <div class="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{{ fieldCount(model) }} fields</span>
                      <span class="text-border">|</span>
                      <span class="truncate">{{ Object.keys(model.fields).join(', ') }}</span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>

            <!-- Extractions -->
            <div v-if="extractionsByModel.length > 0" class="space-y-3">
              <h3 class="text-sm font-medium text-muted-foreground">
                Extractions ({{ plan.extractions.length }} strings)
              </h3>
              <Collapsible
                v-for="group in extractionsByModel"
                :key="group.model"
                :default-open="extractionsByModel.length <= 5"
              >
                <Card class="overflow-hidden">
                  <CollapsibleTrigger class="flex w-full items-center gap-3 p-3 hover:bg-muted/50 transition-colors text-left">
                    <Layers class="size-4 text-primary shrink-0" />
                    <span class="text-sm font-medium text-foreground flex-1">{{ group.model }}</span>
                    <Badge variant="secondary" class="text-[10px]">{{ group.extractions.length }}</Badge>
                    <ChevronDown class="size-3.5 text-muted-foreground shrink-0 transition-transform [[data-state=open]>&]:rotate-180" />
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <Separator />
                    <div class="divide-y divide-border">
                      <div
                        v-for="(ext, ei) in group.extractions"
                        :key="ei"
                        class="flex items-start gap-3 p-3 bg-card"
                      >
                        <span class="font-mono text-[10px] text-muted-foreground mt-1 w-10 text-right shrink-0 tabular-nums">
                          L{{ ext.line }}
                        </span>
                        <div class="flex-1 min-w-0">
                          <span class="text-sm text-foreground break-all">"{{ ext.value }}"</span>
                          <div class="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                            <FileCode class="size-3 shrink-0" />
                            <span class="font-mono truncate">{{ ext.file }}</span>
                            <ArrowRight class="size-3 shrink-0" />
                            <span class="font-medium text-foreground">{{ ext.model }}.{{ ext.field }}</span>
                            <Badge v-if="ext.locale" variant="outline" class="text-[9px] ml-1">{{ ext.locale }}</Badge>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            </div>

            <!-- Patches -->
            <div v-if="patchesByFile.length > 0" class="space-y-3">
              <h3 class="text-sm font-medium text-muted-foreground">
                Source Patches ({{ plan.patches.length }} replacements)
              </h3>
              <Collapsible
                v-for="group in patchesByFile"
                :key="group.file"
                :default-open="patchesByFile.length <= 5"
              >
                <Card class="overflow-hidden">
                  <CollapsibleTrigger class="flex w-full items-center gap-3 p-3 hover:bg-muted/50 transition-colors text-left">
                    <FileCode class="size-4 text-muted-foreground shrink-0" />
                    <span class="font-mono text-xs text-foreground flex-1 truncate">{{ group.file }}</span>
                    <Badge variant="secondary" class="text-[10px]">{{ group.patches.length }}</Badge>
                    <ChevronDown class="size-3.5 text-muted-foreground shrink-0 transition-transform [[data-state=open]>&]:rotate-180" />
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <Separator />
                    <div class="divide-y divide-border">
                      <div
                        v-for="(patch, pi) in group.patches"
                        :key="pi"
                        class="p-3 bg-card space-y-1.5"
                      >
                        <div class="flex items-center gap-2">
                          <span class="font-mono text-[10px] text-muted-foreground w-10 text-right shrink-0 tabular-nums">
                            L{{ patch.line }}
                          </span>
                          <div class="flex-1 min-w-0 space-y-1">
                            <div class="flex items-center gap-2">
                              <span class="inline-block size-2 rounded-full bg-destructive/60 shrink-0" />
                              <code class="font-mono text-xs text-destructive/80 break-all">{{ patch.old_value }}</code>
                            </div>
                            <div class="flex items-center gap-2">
                              <span class="inline-block size-2 rounded-full bg-status-success/60 shrink-0" />
                              <code class="font-mono text-xs text-status-success break-all">{{ patch.new_expression }}</code>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            </div>

            <!-- Action buttons -->
            <div class="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-4">
              <Button
                variant="default"
                size="sm"
                :disabled="planApproving || planRejecting || selectedModels.size === 0"
                @click="approvePlan"
              >
                <CheckCircle2 class="size-4" />
                {{ planApproving ? 'Applying...' : selectedModels.size === plan.models.length ? 'Approve All' : `Approve Selected (${selectedModels.size})` }}
              </Button>
              <Button
                variant="outline"
                size="sm"
                :disabled="planApproving || planRejecting"
                class="text-destructive hover:text-destructive"
                @click="rejectPlan"
              >
                <Trash2 class="size-4" />
                {{ planRejecting ? 'Rejecting...' : 'Reject Plan' }}
              </Button>
              <span class="flex-1" />
              <span class="text-xs text-muted-foreground">
                {{ selectedModels.size }} of {{ plan.models.length }} models selected
              </span>
            </div>
          </template>
        </TabsContent>

        <!-- ===================== SCAN EXPLORER TAB ===================== -->
        <TabsContent value="scan" class="space-y-6 mt-4">
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
              <h2 class="text-xl font-semibold">Explore your project strings</h2>
              <p class="mt-2 max-w-md text-sm text-muted-foreground">
                Click <strong>Scan</strong> to find hardcoded strings in your source files,
                or <strong>Summary</strong> for a quick overview.
              </p>
            </div>
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
                    Scan
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
        </TabsContent>
      </Tabs>

      <!-- Results error -->
      <div v-if="resultsError" class="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
        {{ resultsError }}
      </div>

      <StudioHint id="normalize" message="Track normalize history and manage extractions in Contentrain Studio." class="mt-6" />
    </div>
  </div>
</template>

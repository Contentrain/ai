<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useApi } from '@/composables/useApi'
import type {
  NormalizePlanExtraction,
  NormalizePlanModel,
  NormalizePlanPatch,
} from '@/stores/content'
import {
  ScanSearch, FileCode, Terminal, ArrowRight, Sparkles,
  FileText, BarChart3, Languages, CheckCircle2, MapPin,
} from 'lucide-vue-next'
import PageHeader from '@/components/layout/PageHeader.vue'
import StudioHint from '@/components/layout/StudioHint.vue'
import ExtractionReviewPanel from '@/components/normalize/ExtractionReviewPanel.vue'
import SourceTracePanel from '@/components/normalize/SourceTracePanel.vue'
import PatchPreviewPanel from '@/components/normalize/PatchPreviewPanel.vue'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'

const api = useApi()

interface Candidate {
  value: string
  file: string
  line: number
  confidence: number
}

interface ScanResult {
  mode: string
  candidates?: Candidate[]
  duplicates?: Array<{ value: string; count: number; files: string[] }>
  stats?: { total_scanned: number; candidates_found: number; total_files: number }
}

interface NormalizePlan {
  models: NormalizePlanModel[]
  extractions: NormalizePlanExtraction[]
  patches: NormalizePlanPatch[]
}

const result = ref<ScanResult | null>(null)
const plan = ref<NormalizePlan | null>(null)
const loading = ref(false)
const selectedExtraction = ref<NormalizePlanExtraction | null>(null)
const selectedModels = ref<Set<string>>(new Set())

function onSelectExtraction(ext: NormalizePlanExtraction) {
  selectedExtraction.value = ext
}

// Group candidates by file
const candidatesByFile = computed(() => {
  if (!result.value?.candidates) return []
  const groups = new Map<string, Candidate[]>()
  for (const c of result.value.candidates) {
    const existing = groups.get(c.file) ?? []
    existing.push(c)
    groups.set(c.file, existing)
  }
  return [...groups.entries()].map(([file, candidates]) => ({
    file,
    candidates: candidates.toSorted((a, b) => a.line - b.line),
  }))
})

function confidenceColor(confidence: number): string {
  if (confidence >= 0.9) return 'text-status-success bg-status-success/10'
  if (confidence >= 0.7) return 'text-status-warning bg-status-warning/10'
  return 'text-muted-foreground bg-muted'
}

onMounted(async () => {
  loading.value = true
  try {
    // Load scan results from context
    const ctx = await api.get<{ lastOperation?: { tool?: string; result?: ScanResult } }>('/context')
    if (
      ctx.lastOperation?.tool === 'contentrain_apply' ||
      ctx.lastOperation?.tool === 'contentrain_scan'
    ) {
      if (ctx.lastOperation.result) {
        result.value = ctx.lastOperation.result
      }
    }

    // Load normalize sources (plan data)
    const sourcesResult = await api.get<{ sources: NormalizePlan | null }>('/normalize/sources')
    if (sourcesResult.sources) {
      plan.value = sourcesResult.sources
      // Select all models by default
      for (const model of sourcesResult.sources.models) {
        selectedModels.value.add(model.id)
      }
    }
  } catch {
    // No normalize results yet
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div>
    <PageHeader title="Normalize" description="Content extraction and i18n readiness" />

    <div class="px-6 py-6">
      <!-- Loading -->
      <div v-if="loading" class="flex justify-center py-12">
        <div class="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>

      <!-- No results: empty state -->
      <div v-else-if="!result && !plan" class="space-y-8">
        <!-- Hero empty state -->
        <div class="flex flex-col items-center py-12 text-center">
          <img src="/select-data-type.svg" alt="" class="empty-illustration mb-6" />
          <h2 class="text-xl font-semibold">Extract hardcoded strings</h2>
          <p class="mt-2 max-w-md text-sm text-muted-foreground">
            Normalize scans your source files for hardcoded strings and extracts them into
            content models, making your project i18n-ready.
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
              <div class="flex items-start gap-4">
                <Badge variant="secondary" class="mt-0.5 shrink-0 size-7 flex items-center justify-center rounded-full font-mono text-xs">1</Badge>
                <div>
                  <p class="text-sm font-medium">Scan</p>
                  <p class="text-xs text-muted-foreground mt-0.5">AI scans your source files for hardcoded strings and identifies extraction candidates.</p>
                </div>
              </div>
              <div class="flex items-start gap-4">
                <Badge variant="secondary" class="mt-0.5 shrink-0 size-7 flex items-center justify-center rounded-full font-mono text-xs">2</Badge>
                <div>
                  <p class="text-sm font-medium">Extract</p>
                  <p class="text-xs text-muted-foreground mt-0.5">Strings are extracted into Contentrain content models with proper keys and structure.</p>
                </div>
              </div>
              <div class="flex items-start gap-4">
                <Badge variant="secondary" class="mt-0.5 shrink-0 size-7 flex items-center justify-center rounded-full font-mono text-xs">3</Badge>
                <div>
                  <p class="text-sm font-medium">Patch</p>
                  <p class="text-xs text-muted-foreground mt-0.5">Source files are patched to reference the extracted content instead of hardcoded strings.</p>
                </div>
              </div>
              <div class="flex items-start gap-4">
                <Badge variant="secondary" class="mt-0.5 shrink-0 size-7 flex items-center justify-center rounded-full font-mono text-xs">4</Badge>
                <div>
                  <p class="text-sm font-medium">Review</p>
                  <p class="text-xs text-muted-foreground mt-0.5">Changes appear as branches for review. Approve or reject from the Branches page.</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <!-- Terminal CTA -->
        <Card class="mx-auto max-w-2xl border-dashed">
          <CardContent class="flex items-center gap-4 p-4">
            <div class="flex size-10 items-center justify-center rounded-lg bg-muted">
              <Terminal class="size-5 text-muted-foreground" />
            </div>
            <div class="flex-1">
              <p class="text-sm font-medium">Run from your terminal</p>
              <code class="mt-1 block rounded bg-muted px-3 py-1.5 font-mono text-xs text-foreground">
                npx contentrain normalize
              </code>
            </div>
            <ArrowRight class="size-4 text-muted-foreground shrink-0" />
          </CardContent>
        </Card>
      </div>

      <!-- Results -->
      <div v-else class="space-y-6">
        <!-- Stats summary (scan results) -->
        <div v-if="result" class="grid grid-cols-3 gap-3">
          <Card>
            <CardContent class="flex items-center gap-3 p-4">
              <div class="flex size-10 items-center justify-center rounded-lg bg-muted">
                <FileText class="size-5 text-muted-foreground" />
              </div>
              <div>
                <div class="text-2xl font-bold tabular-nums">{{ result.stats?.total_files ?? 0 }}</div>
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
                <div class="text-2xl font-bold tabular-nums">{{ result.stats?.candidates_found ?? 0 }}</div>
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
                <div class="text-2xl font-bold tabular-nums">{{ result.stats?.total_scanned ?? 0 }}</div>
                <div class="text-xs text-muted-foreground">Strings analyzed</div>
              </div>
            </CardContent>
          </Card>
        </div>

        <!-- Plan Review: Extraction + Source Trace -->
        <div v-if="plan && plan.extractions.length > 0">
          <!-- Extraction Review -->
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <h3 class="text-sm font-semibold text-foreground mb-3">Extractions</h3>
              <ExtractionReviewPanel
                :models="plan.models"
                :extractions="plan.extractions"
                :selected-models="selectedModels"
                @select-extraction="onSelectExtraction"
              />
            </div>
            <div>
              <h3 class="text-sm font-semibold text-foreground mb-3">Source Trace</h3>
              <SourceTracePanel
                :extraction="selectedExtraction"
                :patches="plan.patches"
                @close="selectedExtraction = null"
              />
              <div v-if="!selectedExtraction" class="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-12 text-center">
                <MapPin class="size-6 text-muted-foreground/40 mb-2" />
                <p class="text-xs text-muted-foreground">Click an extraction to see its source trace</p>
              </div>
            </div>
          </div>

          <!-- Source Patches -->
          <div v-if="plan.patches.length > 0" class="mt-6">
            <h3 class="text-sm font-semibold text-foreground mb-3">Source Patches</h3>
            <PatchPreviewPanel :patches="plan.patches" />
          </div>
        </div>

        <!-- Scan candidates (no plan yet) -->
        <template v-if="result">
          <!-- No candidates found -->
          <div v-if="candidatesByFile.length === 0 && !plan" class="flex flex-col items-center py-12 text-center">
            <div class="flex size-16 items-center justify-center rounded-full bg-status-success/10 mb-4">
              <CheckCircle2 class="size-8 text-status-success" />
            </div>
            <h2 class="text-lg font-semibold">No hardcoded strings found</h2>
            <p class="mt-2 text-sm text-muted-foreground">Your project looks clean. No extraction candidates detected.</p>
          </div>

          <!-- Candidates grouped by file -->
          <div v-if="candidatesByFile.length > 0" class="space-y-3">
            <h3 class="text-sm font-medium text-muted-foreground">Candidates by file</h3>

            <Collapsible
              v-for="group in candidatesByFile"
              :key="group.file"
              :default-open="true"
            >
              <Card class="overflow-hidden">
                <CollapsibleTrigger class="flex w-full items-center gap-3 p-3 hover:bg-muted/50 transition-colors text-left">
                  <FileCode class="size-4 text-muted-foreground shrink-0" />
                  <span class="font-mono text-xs text-foreground flex-1 truncate">{{ group.file }}</span>
                  <Badge variant="secondary" class="text-[10px]">{{ group.candidates.length }}</Badge>
                </CollapsibleTrigger>

                <CollapsibleContent>
                  <Separator />
                  <div class="divide-y divide-border">
                    <div
                      v-for="(candidate, ci) in group.candidates"
                      :key="ci"
                      class="flex items-start gap-3 p-3 bg-card"
                    >
                      <span class="font-mono text-[10px] text-muted-foreground mt-1 w-8 text-right shrink-0 tabular-nums">
                        L{{ candidate.line }}
                      </span>
                      <div class="flex-1 min-w-0">
                        <span class="text-sm font-medium text-foreground break-all">"{{ candidate.value }}"</span>
                      </div>
                      <Badge
                        :class="confidenceColor(candidate.confidence)"
                        class="text-[10px] shrink-0 font-mono"
                      >
                        {{ Math.round(candidate.confidence * 100) }}%
                      </Badge>
                    </div>
                  </div>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          </div>

          <!-- Duplicates section -->
          <div v-if="result.duplicates && result.duplicates.length > 0" class="space-y-3">
            <h3 class="text-sm font-medium text-muted-foreground">Duplicate strings</h3>
            <Card>
              <div class="divide-y divide-border">
                <div
                  v-for="(dup, di) in result.duplicates"
                  :key="di"
                  class="flex items-start gap-3 p-3"
                >
                  <ScanSearch class="size-4 text-status-warning mt-0.5 shrink-0" />
                  <div class="flex-1 min-w-0">
                    <span class="text-sm font-medium text-foreground">"{{ dup.value }}"</span>
                    <div class="mt-1 flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" class="text-[10px]">{{ dup.count }}x</Badge>
                      <span
                        v-for="f in dup.files"
                        :key="f"
                        class="font-mono text-[10px] text-muted-foreground"
                      >{{ f }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </template>
      </div>

      <StudioHint id="normalize" message="Track normalize history and manage extractions in Contentrain Studio." class="mt-6" />
    </div>
  </div>
</template>

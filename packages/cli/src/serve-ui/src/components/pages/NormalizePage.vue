<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { toast } from 'vue-sonner'
import { useContentStore } from '@/stores/content'
import type { NormalizePlanExtraction } from '@/stores/content'
import { useWatch } from '@/composables/useWatch'
import {
  Sparkles, MapPin, Loader2, Trash2, GitMerge, CheckCircle2, Bot, Terminal,
} from 'lucide-vue-next'
import PageHeader from '@/components/layout/PageHeader.vue'
import StudioHint from '@/components/layout/StudioHint.vue'
import ExtractionReviewPanel from '@/components/normalize/ExtractionReviewPanel.vue'
import SourceTracePanel from '@/components/normalize/SourceTracePanel.vue'
import PatchPreviewPanel from '@/components/normalize/PatchPreviewPanel.vue'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'

const store = useContentStore()

// ─── Phase state machine ───
type Phase = 'empty' | 'plan' | 'branches'

const phase = computed<Phase>(() => {
  if (store.normalizePlan) return 'plan'
  if (store.normalizeResults?.pendingBranches?.length) return 'branches'
  return 'empty'
})

// ─── Plan state ───
const selectedExtraction = ref<NormalizePlanExtraction | null>(null)
const selectedModels = ref<Set<string>>(new Set())
const approving = ref(false)
const rejecting = ref(false)
const loading = ref(false)

function onSelectExtraction(ext: NormalizePlanExtraction) {
  selectedExtraction.value = ext
}

// ─── Actions ───
async function handleApprove() {
  approving.value = true
  try {
    const models = selectedModels.value.size ? [...selectedModels.value] : undefined
    await store.approvePlan(models)
    await Promise.all([store.fetchNormalizePlan(), store.fetchNormalizeResults()])
    toast.success('Plan approved and applied')
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Failed to approve plan')
  } finally {
    approving.value = false
  }
}

async function handleReject() {
  rejecting.value = true
  try {
    await store.rejectPlan()
    store.normalizePlan = null
    toast.success('Plan rejected')
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Failed to reject plan')
  } finally {
    rejecting.value = false
  }
}

// ─── Branch actions ───
const mergingBranch = ref<string | null>(null)
const deletingBranch = ref<string | null>(null)

async function mergeBranch(branchName: string) {
  mergingBranch.value = branchName
  try {
    await store.approveBranch(branchName)
    await store.fetchNormalizeResults()
    toast.success('Branch merged successfully')
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Failed to merge branch')
  } finally {
    mergingBranch.value = null
  }
}

async function deleteBranch(branchName: string) {
  deletingBranch.value = branchName
  try {
    await store.rejectBranch(branchName)
    await store.fetchNormalizeResults()
    toast.success('Branch deleted successfully')
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Failed to delete branch')
  } finally {
    deletingBranch.value = null
  }
}

// ─── WebSocket ───
useWatch((event) => {
  if (event.type === 'normalize:plan-updated') {
    store.fetchNormalizePlan()
  }
  if (event.type === 'branch:created' || event.type === 'branch:merged') {
    store.fetchNormalizeResults()
  }
})

// ─── Init ───
onMounted(async () => {
  loading.value = true
  try {
    await Promise.all([store.fetchNormalizePlan(), store.fetchNormalizeResults()])
    // Select all models by default if plan exists
    if (store.normalizePlan) {
      for (const model of store.normalizePlan.models) {
        selectedModels.value.add(model.id)
      }
    }
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Failed to load normalize data')
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
        <Loader2 class="size-5 animate-spin text-muted-foreground" />
      </div>

      <!-- ═══ Phase: empty — no plan, no branches ═══ -->
      <div v-else-if="phase === 'empty'" class="space-y-8">
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
                  <p class="text-sm font-medium">Ask your AI agent</p>
                  <p class="text-xs text-muted-foreground mt-0.5">Tell your agent: "normalize my project" or "extract content strings". The agent scans, classifies, and prepares an extraction plan.</p>
                </div>
              </div>
              <div class="flex items-start gap-4">
                <Badge variant="secondary" class="mt-0.5 shrink-0 size-7 flex items-center justify-center rounded-full font-mono text-xs">2</Badge>
                <div>
                  <p class="text-sm font-medium">Review the plan here</p>
                  <p class="text-xs text-muted-foreground mt-0.5">The agent sends you here to review extractions, source traces, and patches before applying.</p>
                </div>
              </div>
              <div class="flex items-start gap-4">
                <Badge variant="secondary" class="mt-0.5 shrink-0 size-7 flex items-center justify-center rounded-full font-mono text-xs">3</Badge>
                <div>
                  <p class="text-sm font-medium">Approve or reject</p>
                  <p class="text-xs text-muted-foreground mt-0.5">Approved extractions are written to content models on a review branch. Reject to discard.</p>
                </div>
              </div>
              <div class="flex items-start gap-4">
                <Badge variant="secondary" class="mt-0.5 shrink-0 size-7 flex items-center justify-center rounded-full font-mono text-xs">4</Badge>
                <div>
                  <p class="text-sm font-medium">Merge</p>
                  <p class="text-xs text-muted-foreground mt-0.5">Review branches appear below. Merge to apply changes to your main branch.</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <!-- Agent CTA -->
        <Card class="mx-auto max-w-2xl border-dashed">
          <CardContent class="flex items-center gap-4 p-4">
            <div class="flex size-10 items-center justify-center rounded-lg bg-primary/10">
              <Bot class="size-5 text-primary" />
            </div>
            <div class="flex-1">
              <p class="text-sm font-medium">Start from your AI agent</p>
              <p class="mt-0.5 text-xs text-muted-foreground">
                Ask your agent to normalize your project. It will scan, classify, and prepare a plan for your review.
              </p>
            </div>
          </CardContent>
        </Card>

        <!-- Terminal hint -->
        <Card class="mx-auto max-w-2xl border-dashed">
          <CardContent class="flex items-center gap-4 p-4">
            <div class="flex size-10 items-center justify-center rounded-lg bg-muted">
              <Terminal class="size-5 text-muted-foreground" />
            </div>
            <div class="flex-1">
              <p class="text-sm font-medium">Or run the CLI</p>
              <code class="mt-1 block rounded bg-muted px-3 py-1.5 font-mono text-xs text-foreground">
                npx contentrain serve
              </code>
            </div>
          </CardContent>
        </Card>
      </div>

      <!-- ═══ Phase: plan — agent prepared a plan, human reviews ═══ -->
      <div v-else-if="phase === 'plan' && store.normalizePlan" class="space-y-6">
        <!-- Plan header -->
        <Card>
          <CardContent class="flex items-center justify-between p-4">
            <div>
              <h3 class="text-sm font-semibold">Normalize Plan</h3>
              <p class="text-xs text-muted-foreground mt-0.5">
                {{ store.normalizePlan.extractions.length }} extractions across {{ store.normalizePlan.models.length }} models
                <template v-if="store.normalizePlan.patches.length">
                  &middot; {{ store.normalizePlan.patches.length }} patches
                </template>
              </p>
            </div>
            <div class="flex items-center gap-2">
              <Button variant="outline" :disabled="rejecting || approving" @click="handleReject">
                <Loader2 v-if="rejecting" class="size-4 animate-spin" />
                <Trash2 v-else />
                {{ rejecting ? 'Rejecting...' : 'Reject' }}
              </Button>
              <Button :disabled="approving || rejecting" @click="handleApprove">
                <Loader2 v-if="approving" class="size-4 animate-spin" />
                <CheckCircle2 v-else />
                {{ approving ? 'Applying...' : 'Approve & Apply' }}
              </Button>
            </div>
          </CardContent>
        </Card>

        <!-- Scan stats (if available) -->
        <Card v-if="store.normalizePlan.scan_stats" class="bg-muted/30">
          <CardContent class="flex items-center gap-6 p-4 text-xs text-muted-foreground">
            <span><strong class="text-foreground tabular-nums">{{ store.normalizePlan.scan_stats.files_scanned }}</strong> files scanned</span>
            <span><strong class="text-foreground tabular-nums">{{ store.normalizePlan.scan_stats.raw_strings }}</strong> strings found</span>
            <span><strong class="text-foreground tabular-nums">{{ store.normalizePlan.scan_stats.candidates_sent }}</strong> candidates</span>
            <span><strong class="text-foreground tabular-nums">{{ store.normalizePlan.scan_stats.extracted }}</strong> extracted</span>
            <span><strong class="text-foreground tabular-nums">{{ store.normalizePlan.scan_stats.skipped }}</strong> skipped</span>
          </CardContent>
        </Card>

        <!-- Extraction Review + Source Trace -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <h3 class="text-sm font-semibold text-foreground mb-3">Extractions</h3>
            <ExtractionReviewPanel
              :models="store.normalizePlan.models"
              :extractions="store.normalizePlan.extractions"
              :selected-models="selectedModels"
              @select-extraction="onSelectExtraction"
            />
          </div>
          <div>
            <h3 class="text-sm font-semibold text-foreground mb-3">Source Trace</h3>
            <SourceTracePanel
              v-if="selectedExtraction"
              :extraction="selectedExtraction"
              :patches="store.normalizePlan.patches"
              @close="selectedExtraction = null"
            />
            <div v-else class="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-12 text-center">
              <MapPin class="size-6 text-muted-foreground/40 mb-2" />
              <p class="text-xs text-muted-foreground">Click an extraction to see its source trace</p>
            </div>
          </div>
        </div>

        <!-- Source Patches -->
        <div v-if="store.normalizePlan.patches.length > 0">
          <h3 class="text-sm font-semibold text-foreground mb-3">Source Patches</h3>
          <PatchPreviewPanel :patches="store.normalizePlan.patches" />
        </div>
      </div>

      <!-- ═══ Phase: branches — pending normalize branches ═══ -->
      <div v-else-if="phase === 'branches' && store.normalizeResults" class="space-y-6">
        <div class="flex flex-col items-center py-6 text-center">
          <div class="flex size-14 items-center justify-center rounded-full bg-status-info/10 mb-4">
            <GitMerge class="size-7 text-status-info" />
          </div>
          <h2 class="text-lg font-semibold">Pending normalize branches</h2>
          <p class="mt-1 text-sm text-muted-foreground">Review and merge normalize branches into your main branch.</p>
        </div>

        <div class="space-y-3 max-w-2xl mx-auto">
          <Card
            v-for="branch in store.normalizeResults.pendingBranches"
            :key="branch.name"
            class="overflow-hidden"
          >
            <CardContent class="flex items-center gap-3 p-4">
              <GitMerge class="size-4 text-status-info shrink-0" />
              <span class="font-mono text-xs text-foreground flex-1 truncate">{{ branch.name }}</span>
              <Button variant="outline" size="sm" :disabled="deletingBranch === branch.name || mergingBranch === branch.name" @click="deleteBranch(branch.name)">
                <Loader2 v-if="deletingBranch === branch.name" class="size-4 animate-spin" />
                <Trash2 v-else />
                Delete
              </Button>
              <Button size="sm" :disabled="mergingBranch === branch.name || deletingBranch === branch.name" @click="mergeBranch(branch.name)">
                <Loader2 v-if="mergingBranch === branch.name" class="size-4 animate-spin" />
                <GitMerge v-else />
                Merge
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <StudioHint id="normalize" message="Track normalize history and manage extractions in Contentrain Studio." class="mt-6" />
    </div>
  </div>
</template>

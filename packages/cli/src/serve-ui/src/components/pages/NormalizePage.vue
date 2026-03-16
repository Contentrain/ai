<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { toast } from 'vue-sonner'
import { dictionary } from '#contentrain'
import { useContentStore } from '@/stores/content'
import type { NormalizePlanExtraction } from '@/stores/content'
import { useWatch } from '@/composables/useWatch'
import {
  Sparkles, MapPin, Loader2, Trash2, GitMerge, CheckCircle2,
} from 'lucide-vue-next'
import PageHeader from '@/components/layout/PageHeader.vue'
import StudioHint from '@/components/layout/StudioHint.vue'
import AgentPrompt from '@/components/layout/AgentPrompt.vue'
import AgentPromptGroup from '@/components/layout/AgentPromptGroup.vue'
import ExtractionReviewPanel from '@/components/normalize/ExtractionReviewPanel.vue'
import SourceTracePanel from '@/components/normalize/SourceTracePanel.vue'
import PatchPreviewPanel from '@/components/normalize/PatchPreviewPanel.vue'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'

const store = useContentStore()
const t = dictionary('serve-ui-texts').locale('en').get()

// ─── Phase state machine ───
type Phase = 'empty' | 'plan' | 'branches' | 'done'

const phase = computed<Phase>(() => {
  if (store.normalizePlan) return 'plan'
  if (store.normalizeResults?.pendingBranches?.length) return 'branches'
  if (mergeSuccess.value) return 'done'
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
    toast.success('Plan approved — extraction branch created. Review and merge below.', { duration: 6000 })
    await Promise.all([store.fetchNormalizePlan(), store.fetchNormalizeResults()])
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

const mergeSuccess = ref(false)

async function mergeBranch(branchName: string) {
  mergingBranch.value = branchName
  try {
    await store.approveBranch(branchName)
    await store.fetchNormalizeResults()
    toast.success('Branch merged — tell your agent to continue with Phase 2', { duration: 6000 })
    if (!store.normalizeResults?.pendingBranches?.length) {
      mergeSuccess.value = true
    }
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
    <PageHeader :title="t['normalize.normalize']" :description="t['normalize.content-extraction-and-i18n']" />

    <div class="px-6 py-6">
      <!-- Loading -->
      <div v-if="loading" class="flex justify-center py-12">
        <Loader2 class="size-5 animate-spin text-muted-foreground" />
      </div>

      <!-- ═══ Phase: empty — no plan, no branches ═══ -->
      <div v-else-if="phase === 'empty'" class="space-y-8">
        <div class="flex flex-col items-center py-12 text-center">
          <img src="/select-data-type.svg" alt="" class="empty-illustration mb-6" />
          <h2 class="text-xl font-semibold">{{ t['normalize.extract-hardcoded-strings'] }}</h2>
          <p class="mt-2 max-w-md text-sm text-muted-foreground">
            {{ t['normalize.normalize-scans-your-source'] }}
          </p>
        </div>

        <!-- Agent prompt hints -->
        <div class="mx-auto max-w-2xl">
          <AgentPromptGroup :title="t['normalize.ask-your-ai-agent']">
            <AgentPrompt :prompt="t['normalize.normalize-my-vue-project']" />
            <AgentPrompt :prompt="t['normalize.scan-srcpages-for-content']" />
            <AgentPrompt :prompt="t['normalize.extract-hero-section-text']" />
            <AgentPrompt :prompt="t['normalize.make-my-landing-page']" />
          </AgentPromptGroup>
        </div>

        <!-- How it works -->
        <Card class="mx-auto max-w-2xl">
          <CardHeader class="pb-3">
            <CardTitle class="text-sm font-medium flex items-center gap-2">
              <Sparkles class="size-4 text-primary" />
              {{ t['normalize.how-it-works'] }}
            </CardTitle>
          </CardHeader>
          <Separator />
          <CardContent class="pt-4">
            <div class="space-y-4">
              <div class="flex items-start gap-4">
                <Badge variant="secondary" class="mt-0.5 shrink-0 size-7 flex items-center justify-center rounded-full font-mono text-xs">1</Badge>
                <div>
                  <p class="text-sm font-medium">{{ t['normalize.prompt-your-ai-agent'] }}</p>
                  <p class="text-xs text-muted-foreground mt-0.5">{{ t['normalize.copy-a-prompt-above'] }}</p>
                </div>
              </div>
              <div class="flex items-start gap-4">
                <Badge variant="secondary" class="mt-0.5 shrink-0 size-7 flex items-center justify-center rounded-full font-mono text-xs">2</Badge>
                <div>
                  <p class="text-sm font-medium">{{ t['normalize.review-the-plan-here'] }}</p>
                  <p class="text-xs text-muted-foreground mt-0.5">{{ t['normalize.the-agent-sends-the'] }}</p>
                </div>
              </div>
              <div class="flex items-start gap-4">
                <Badge variant="secondary" class="mt-0.5 shrink-0 size-7 flex items-center justify-center rounded-full font-mono text-xs">3</Badge>
                <div>
                  <p class="text-sm font-medium">{{ t['normalize.approve-or-request-changes'] }}</p>
                  <p class="text-xs text-muted-foreground mt-0.5">{{ t['normalize.approve-to-write-extractions'] }}</p>
                </div>
              </div>
              <div class="flex items-start gap-4">
                <Badge variant="secondary" class="mt-0.5 shrink-0 size-7 flex items-center justify-center rounded-full font-mono text-xs">4</Badge>
                <div>
                  <p class="text-sm font-medium">{{ t['normalize.merge-and-continue'] }}</p>
                  <p class="text-xs text-muted-foreground mt-0.5">{{ t['normalize.merge-review-branches-into'] }}</p>
                </div>
              </div>
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
              <h3 class="text-sm font-semibold">{{ t['normalize.normalize-plan'] }}</h3>
              <p class="text-xs text-muted-foreground mt-0.5">
                {{ store.normalizePlan.extractions.length }} {{ t['normalize.extractions-across'] }} {{ store.normalizePlan.models.length }} {{ t['normalize.models'] }}
                <template v-if="store.normalizePlan.patches.length">
                  &middot; {{ store.normalizePlan.patches.length }} {{ t['normalize.patches'] }}
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

        <!-- Plan adjustment prompts -->
        <div class="max-w-md">
          <AgentPromptGroup :title="t['normalize.request-changes-from-your']">
            <AgentPrompt :prompt="t['normalize.adjust-the-normalize-plan']" />
            <AgentPrompt :prompt="t['normalize.remove-navigation-labels-from']" />
          </AgentPromptGroup>
        </div>

        <!-- Scan stats (if available) -->
        <Card v-if="store.normalizePlan.scan_stats" class="bg-muted/30">
          <CardContent class="flex items-center gap-6 p-4 text-xs text-muted-foreground">
            <span><strong class="text-foreground tabular-nums">{{ store.normalizePlan.scan_stats.files_scanned }}</strong> {{ t['normalize.files-scanned'] }}</span>
            <span><strong class="text-foreground tabular-nums">{{ store.normalizePlan.scan_stats.raw_strings }}</strong> {{ t['normalize.strings-found'] }}</span>
            <span><strong class="text-foreground tabular-nums">{{ store.normalizePlan.scan_stats.candidates_sent }}</strong> {{ t['normalize.candidates'] }}</span>
            <span><strong class="text-foreground tabular-nums">{{ store.normalizePlan.scan_stats.extracted }}</strong> {{ t['normalize.extracted'] }}</span>
            <span><strong class="text-foreground tabular-nums">{{ store.normalizePlan.scan_stats.skipped }}</strong> {{ t['normalize.skipped'] }}</span>
          </CardContent>
        </Card>

        <!-- Extraction Review + Source Trace -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <h3 class="text-sm font-semibold text-foreground mb-3">{{ t['normalize.extractions'] }}</h3>
            <ExtractionReviewPanel
              :models="store.normalizePlan.models"
              :extractions="store.normalizePlan.extractions"
              :selected-models="selectedModels"
              @select-extraction="onSelectExtraction"
            />
          </div>
          <div>
            <h3 class="text-sm font-semibold text-foreground mb-3">{{ t['normalize.source-trace'] }}</h3>
            <SourceTracePanel
              v-if="selectedExtraction"
              :extraction="selectedExtraction"
              :patches="store.normalizePlan.patches"
              @close="selectedExtraction = null"
            />
            <div v-else class="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-12 text-center">
              <MapPin class="size-6 text-muted-foreground/40 mb-2" />
              <p class="text-xs text-muted-foreground">{{ t['normalize.click-an-extraction-to'] }}</p>
            </div>
          </div>
        </div>

        <!-- Source Patches -->
        <div v-if="store.normalizePlan.patches.length > 0">
          <h3 class="text-sm font-semibold text-foreground mb-3">{{ t['normalize.source-patches'] }}</h3>
          <PatchPreviewPanel :patches="store.normalizePlan.patches" />
        </div>
      </div>

      <!-- ═══ Phase: branches — pending normalize branches ═══ -->
      <div v-else-if="phase === 'branches' && store.normalizeResults" class="space-y-6">
        <div class="flex flex-col items-center py-6 text-center">
          <div class="flex size-14 items-center justify-center rounded-full bg-status-info/10 mb-4">
            <GitMerge class="size-7 text-status-info" />
          </div>
          <h2 class="text-lg font-semibold">{{ t['normalize.pending-normalize-branches'] }}</h2>
          <p class="mt-1 text-sm text-muted-foreground">{{ t['normalize.review-and-merge-normalize'] }}</p>
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
                {{ t['normalize.delete'] }}
              </Button>
              <Button size="sm" :disabled="mergingBranch === branch.name || deletingBranch === branch.name" @click="mergeBranch(branch.name)">
                <Loader2 v-if="mergingBranch === branch.name" class="size-4 animate-spin" />
                <GitMerge v-else />
                {{ t['normalize.merge'] }}
              </Button>
            </CardContent>
          </Card>
        </div>

        <!-- Phase 2 prompts -->
        <div class="max-w-2xl mx-auto">
          <AgentPromptGroup :title="t['normalize.whats-next-ask-your']">
            <AgentPrompt :prompt="t['normalize.continue-to-phase-2']" />
            <AgentPrompt :prompt="t['normalize.start-reuse-for-the']" />
          </AgentPromptGroup>
        </div>
      </div>

      <!-- ═══ Phase: done — extract merged, ready for Phase 2 ═══ -->
      <div v-else-if="phase === 'done'" class="space-y-8">
        <div class="flex flex-col items-center py-12 text-center">
          <div class="flex size-16 items-center justify-center rounded-full bg-status-success/10 mb-4">
            <CheckCircle2 class="size-8 text-status-success" />
          </div>
          <h2 class="text-xl font-semibold">Phase 1 complete</h2>
          <p class="mt-2 max-w-md text-sm text-muted-foreground">
            Content strings have been extracted into models and merged. Tell your AI agent to continue with Phase 2 — patching source files with content references.
          </p>
        </div>

        <div class="max-w-2xl mx-auto space-y-4">
          <AgentPromptGroup title="Tell your agent">
            <AgentPrompt prompt="Continue to Phase 2 — patch serve-ui source files with content references" label="recommended" />
            <AgentPrompt prompt="Start reuse for all extracted content models in serve-ui domain" />
          </AgentPromptGroup>
        </div>
      </div>

      <StudioHint :message="t['normalize.track-normalize-history-and']" class="mt-6" />
    </div>
  </div>
</template>

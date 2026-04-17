<script setup lang="ts">
import { onMounted, computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useContentStore } from '@/stores/content'
import {
  ArrowLeft, Check, X, GitMerge, GitBranch, FileText, Plus, Minus,
  Loader2, CheckCircle, XCircle, File,
} from 'lucide-vue-next'
import PageHeader from '@/components/layout/PageHeader.vue'
import AgentPrompt from '@/components/layout/AgentPrompt.vue'
import AgentPromptGroup from '@/components/layout/AgentPromptGroup.vue'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { TrustBadge } from '@/components/ui/trust-badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import { toast } from 'vue-sonner'
import { dictionary } from '#contentrain'
import { useApi } from '@/composables/useApi'

const route = useRoute()
const router = useRouter()
const store = useContentStore()
const api = useApi()
const t = dictionary('serve-ui-texts').locale('en').get()

const branchName = computed(() => decodeURIComponent(route.params.branchName as string))
const diff = computed(() => store.branchDiff)
const acting = ref(false)
const actionResult = ref<{ type: 'success' | 'error'; message: string } | null>(null)
const confirmApproveOpen = ref(false)
const confirmRejectOpen = ref(false)

// Sync warning cached server-side from the last mergeBranch() call.
// The dashboard toast surfaces the warning in real time; this panel
// is the canonical drill-down: which files were skipped and why.
interface SyncWarning {
  branch: string
  skipped: string[]
  synced: string[]
  recordedAt: number
}
const syncWarning = ref<SyncWarning | null>(null)

async function fetchSyncWarning() {
  try {
    const encoded = encodeURIComponent(branchName.value)
    const res = await api.get<{ warning: SyncWarning | null }>(`/branches/${encoded}/sync-status`)
    syncWarning.value = res.warning
  } catch {
    syncWarning.value = null
  }
}

// Parse branch name parts
const branchParts = computed(() => {
  const stripped = branchName.value.replace('contentrain/', '')
  const parts = stripped.split('/')
  return {
    scope: parts[0] ?? 'unknown',
    target: parts.length > 2 ? parts.slice(1, -1).join('/') : parts[1] ?? '',
    timestamp: parts.length > 2 ? parts[parts.length - 1] ?? '' : '',
  }
})

// Parse diff into file sections
interface DiffFile {
  path: string
  additions: number
  deletions: number
  lines: Array<{ text: string; type: 'add' | 'remove' | 'hunk' | 'context' | 'header' }>
}

const diffFiles = computed<DiffFile[]>(() => {
  if (!diff.value?.diff) return []
  const raw = diff.value.diff
  const fileSections: DiffFile[] = []
  let currentFile: DiffFile | null = null

  for (const line of raw.split('\n')) {
    if (line.startsWith('diff --git')) {
      if (currentFile) fileSections.push(currentFile)
      const pathMatch = line.match(/b\/(.+)$/)
      currentFile = {
        path: pathMatch?.[1] ?? 'unknown',
        additions: 0,
        deletions: 0,
        lines: [],
      }
      currentFile.lines.push({ text: line, type: 'header' })
    } else if (currentFile) {
      if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('index ')) {
        currentFile.lines.push({ text: line, type: 'header' })
      } else if (line.startsWith('@@')) {
        currentFile.lines.push({ text: line, type: 'hunk' })
      } else if (line.startsWith('+')) {
        currentFile.additions++
        currentFile.lines.push({ text: line, type: 'add' })
      } else if (line.startsWith('-')) {
        currentFile.deletions++
        currentFile.lines.push({ text: line, type: 'remove' })
      } else {
        currentFile.lines.push({ text: line, type: 'context' })
      }
    }
  }
  if (currentFile) fileSections.push(currentFile)
  return fileSections
})

const totalAdditions = computed(() => diffFiles.value.reduce((s, f) => s + f.additions, 0))
const totalDeletions = computed(() => diffFiles.value.reduce((s, f) => s + f.deletions, 0))
const isNormalizeBranch = computed(() => branchName.value.includes('normalize'))

// Parse stat for file count
const statFileCount = computed(() => {
  if (!diff.value?.stat) return 0
  const match = diff.value.stat.match(/(\d+)\s+files?\s+changed/)
  return match ? Number.parseInt(match[1], 10) : diffFiles.value.length
})

async function approve() {
  acting.value = true
  actionResult.value = null
  confirmApproveOpen.value = false
  try {
    await store.approveBranch(branchName.value)
    actionResult.value = { type: 'success', message: t['branch-detail.branch-merged-successfully'] }
    toast.success(t['branch-detail.branch-merged-successfully'])
    setTimeout(() => router.push('/branches'), 1500)
  } catch {
    actionResult.value = { type: 'error', message: t['branch-detail.failed-to-merge-branch'] }
    toast.error(t['branch-detail.failed-to-merge-branch'])
  } finally {
    acting.value = false
  }
}

async function reject() {
  acting.value = true
  actionResult.value = null
  confirmRejectOpen.value = false
  try {
    await store.rejectBranch(branchName.value)
    actionResult.value = { type: 'success', message: t['branch-detail.branch-rejected-and-deleted'] }
    toast.success(t['branch-detail.branch-rejected-and-deleted'])
    setTimeout(() => router.push('/branches'), 1500)
  } catch {
    actionResult.value = { type: 'error', message: t['branch-detail.failed-to-delete-branch'] }
    toast.error(t['branch-detail.failed-to-delete-branch'])
  } finally {
    acting.value = false
  }
}

onMounted(async () => {
  try {
    await store.fetchBranchDiff(branchName.value)
  } catch {
    toast.error('Failed to load branch data.')
  }
  // Fire-and-forget — missing sync status is the common case (no
  // prior merge to produce warnings).
  void fetchSyncWarning()
})
</script>

<template>
  <div>
    <PageHeader :title="branchParts.target || branchParts.scope" :description="t['branch-detail.branch-review-and-diff']">
      <template #actions>
        <Button variant="ghost" size="sm" @click="router.push('/branches')">
          <ArrowLeft class="mr-1.5 size-4" /> {{ t['branch-detail.back'] }}
        </Button>

        <!-- Approve dialog -->
        <Dialog v-model:open="confirmApproveOpen">
          <DialogTrigger as-child>
            <Button variant="default" size="sm" :disabled="acting || !diff">
              <GitMerge class="mr-1.5 size-4" /> {{ t['branch-detail.approve-merge'] }}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{{ t['branch-detail.confirm-merge'] }}</DialogTitle>
              <DialogDescription>
                {{ t['branch-detail.this-will-merge'] }} <code class="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{{ branchName }}</code>
                {{ t['branch-detail.into'] }} <code class="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{{ diff?.base ?? 'main' }}</code>
                {{ t['branch-detail.and-delete-the-source'] }}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" size="sm" @click="confirmApproveOpen = false">{{ t['branch-detail.cancel'] }}</Button>
              <Button variant="default" size="sm" :disabled="acting" @click="approve">
                <Loader2 v-if="acting" class="mr-1.5 size-4 animate-spin" />
                <Check v-else class="mr-1.5 size-4" />
                {{ t['branch-detail.merge'] }}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <!-- Reject dialog -->
        <Dialog v-model:open="confirmRejectOpen">
          <DialogTrigger as-child>
            <Button variant="destructive" size="sm" :disabled="acting || !diff">
              <X class="mr-1.5 size-4" /> {{ t['branch-detail.reject'] }}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{{ t['branch-detail.confirm-rejection'] }}</DialogTitle>
              <DialogDescription>
                {{ t['branch-detail.this-will-permanently-delete'] }}
                <code class="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{{ branchName }}</code>.
                All changes in this branch will be lost.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" size="sm" @click="confirmRejectOpen = false">{{ t['branch-detail.cancel'] }}</Button>
              <Button variant="destructive" size="sm" :disabled="acting" @click="reject">
                <Loader2 v-if="acting" class="mr-1.5 size-4 animate-spin" />
                <X v-else class="mr-1.5 size-4" />
                {{ t['branch-detail.delete-branch'] }}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </template>
    </PageHeader>

    <div class="px-6 py-6 space-y-4">
      <!-- Action result feedback -->
      <div
        v-if="actionResult"
        :class="cn(
          'flex items-center gap-3 rounded-lg border p-4',
          actionResult.type === 'success' ? 'border-status-success/30 bg-status-success/5' : 'border-status-error/30 bg-status-error/5'
        )"
      >
        <CheckCircle v-if="actionResult.type === 'success'" class="size-5 text-status-success shrink-0" />
        <XCircle v-else class="size-5 text-status-error shrink-0" />
        <span class="text-sm">{{ actionResult.message }}</span>
      </div>

      <!-- Sync warnings from the last mergeBranch() call: files the
           selective sync skipped because the developer has uncommitted
           changes in their working tree. -->
      <div
        v-if="syncWarning && syncWarning.skipped.length > 0"
        class="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950"
      >
        <div class="flex items-start gap-3">
          <XCircle class="size-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div class="flex-1 space-y-2">
            <p class="text-sm font-medium text-amber-900 dark:text-amber-100">
              {{ syncWarning.skipped.length }} file{{ syncWarning.skipped.length === 1 ? '' : 's' }} skipped during selective sync
            </p>
            <p class="text-xs text-amber-800 dark:text-amber-200">
              The merge landed in git, but the developer's working tree has uncommitted changes that would have been overwritten. Review and commit or discard these files, then run the sync again manually if needed.
            </p>
            <ul class="mt-2 space-y-1 font-mono text-xs text-amber-900/80 dark:text-amber-100/80">
              <li v-for="file in syncWarning.skipped" :key="file" class="flex items-center gap-1.5">
                <File class="size-3 shrink-0" /> {{ file }}
              </li>
            </ul>
          </div>
        </div>
      </div>

      <!-- Loading -->
      <div v-if="store.loading" class="flex justify-center py-12">
        <Loader2 class="size-6 animate-spin text-primary" />
      </div>

      <template v-else-if="diff">
        <!-- Branch info card -->
        <Card>
          <CardContent class="p-4">
            <div class="flex items-center gap-4 flex-wrap">
              <div class="flex items-center gap-2">
                <GitBranch class="size-4 text-muted-foreground" />
                <code class="text-xs font-mono bg-muted px-2 py-1 rounded">{{ diff.base }}</code>
              </div>
              <GitMerge class="size-4 text-primary" />
              <div class="flex items-center gap-2">
                <GitBranch class="size-4 text-primary" />
                <code class="text-xs font-mono bg-primary/10 text-primary px-2 py-1 rounded">{{ branchName.replace('contentrain/', '') }}</code>
              </div>
              <div class="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
                <TrustBadge
                  :status="branchParts.scope === 'normalize' ? 'pending' : 'partial'"
                  :reason="branchParts.scope === 'normalize' ? 'Review required' : undefined"
                />
                <span class="flex items-center gap-1">
                  <File class="size-3" /> {{ statFileCount }} {{ t['branch-detail.file'] }}{{ statFileCount !== 1 ? 's' : '' }}
                </span>
                <span class="flex items-center gap-1 text-status-success">
                  <Plus class="size-3" /> {{ totalAdditions }}
                </span>
                <span class="flex items-center gap-1 text-status-error">
                  <Minus class="size-3" /> {{ totalDeletions }}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <!-- Stat summary -->
        <pre v-if="diff.stat" class="rounded-lg border border-border bg-muted/30 p-4 font-mono text-xs text-muted-foreground overflow-x-auto whitespace-pre-wrap">{{ diff.stat }}</pre>

        <!-- File-by-file diffs -->
        <div v-if="diffFiles.length > 0" class="space-y-3">
          <Collapsible
            v-for="(file, fi) in diffFiles"
            :key="fi"
            :default-open="true"
          >
            <Card class="overflow-hidden">
              <CollapsibleTrigger class="flex w-full items-center gap-3 p-3 hover:bg-muted/50 transition-colors text-left">
                <FileText class="size-4 text-muted-foreground shrink-0" />
                <span class="font-mono text-xs text-foreground flex-1 truncate">{{ file.path }}</span>
                <div class="flex items-center gap-2 text-xs shrink-0">
                  <span v-if="file.additions > 0" class="text-status-success font-mono">+{{ file.additions }}</span>
                  <span v-if="file.deletions > 0" class="text-status-error font-mono">-{{ file.deletions }}</span>
                </div>
              </CollapsibleTrigger>

              <CollapsibleContent>
                <Separator />
                <div class="max-h-96 overflow-auto custom-scrollbar">
                  <pre class="p-0 m-0"><code class="block text-xs leading-5"><template
  v-for="(line, li) in file.lines"
  :key="li"
><span
  v-if="line.type !== 'header'"
  :class="{
    'bg-status-success/10 text-status-success': line.type === 'add',
    'bg-status-error/10 text-status-error': line.type === 'remove',
    'bg-primary/5 text-primary font-medium': line.type === 'hunk',
    'text-muted-foreground': line.type === 'context',
  }"
  class="block px-4 font-mono"
>{{ line.text }}</span></template></code></pre>
                </div>
              </CollapsibleContent>
            </Card>
          </Collapsible>
          <!-- Agent prompt hints -->
          <AgentPromptGroup :title="t['branch-detail.ask-your-agent']" class="mt-4">
            <AgentPrompt :prompt="t['branch-detail.review-the-changes-on']" />
            <AgentPrompt :prompt="t['branch-detail.check-the-content-quality']" />
            <AgentPrompt
              v-if="isNormalizeBranch"
              :prompt="t['branch-detail.continue-with-phase-2']"
            />
          </AgentPromptGroup>
        </div>

        <div v-else class="flex flex-col items-center py-12 text-center">
          <img src="/merge-2.svg" alt="" class="empty-illustration mb-4" />
          <p class="text-sm text-muted-foreground">{{ t['branch-detail.no-diff-available-for'] }}</p>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useApi } from '@/composables/useApi'
import { ScanSearch, FileCode } from 'lucide-vue-next'
import PageHeader from '@/components/layout/PageHeader.vue'
import StudioHint from '@/components/layout/StudioHint.vue'
import { Badge } from '@/components/ui/badge'

const api = useApi()

interface ScanResult {
  mode: string
  candidates?: Array<{ value: string; file: string; line: number; confidence: number }>
  stats?: { total_scanned: number; candidates_found: number; total_files: number }
}

const result = ref<ScanResult | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)

onMounted(async () => {
  loading.value = true
  try {
    // Try to get context to see if normalize was run
    const ctx = await api.get<{ lastOperation?: { tool?: string } }>('/context')
    if (ctx.lastOperation?.tool === 'contentrain_apply' || ctx.lastOperation?.tool === 'contentrain_scan') {
      // There might be normalize results
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
    <PageHeader title="Normalize" description="Content extraction results" />

    <div class="px-6 py-6">
      <div v-if="loading" class="flex justify-center py-12">
        <div class="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>

      <!-- No results yet -->
      <div v-else-if="!result" class="flex flex-col items-center py-16 text-center">
        <div class="flex size-16 items-center justify-center rounded-full bg-status-warning/10 mb-4">
          <ScanSearch class="size-8 text-status-warning" />
        </div>
        <h2 class="text-lg font-semibold">No normalize results yet</h2>
        <p class="mt-2 max-w-md text-sm text-muted-foreground">
          Run <code class="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">contentrain normalize</code> in your terminal
          to scan for hardcoded strings, then come back here to review.
        </p>

        <div class="mt-8 w-full max-w-lg rounded-lg border border-border bg-card p-6 text-left">
          <h3 class="text-sm font-medium mb-3">How it works</h3>
          <div class="space-y-3 text-sm text-muted-foreground">
            <div class="flex items-start gap-3">
              <Badge variant="secondary" class="mt-0.5 shrink-0">1</Badge>
              <span>AI scans your source files for hardcoded strings</span>
            </div>
            <div class="flex items-start gap-3">
              <Badge variant="secondary" class="mt-0.5 shrink-0">2</Badge>
              <span>Strings are extracted into content models</span>
            </div>
            <div class="flex items-start gap-3">
              <Badge variant="secondary" class="mt-0.5 shrink-0">3</Badge>
              <span>Source files are patched with content references</span>
            </div>
            <div class="flex items-start gap-3">
              <Badge variant="secondary" class="mt-0.5 shrink-0">4</Badge>
              <span>Review the changes here, then approve</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Results -->
      <div v-else class="space-y-4">
        <div class="flex items-center gap-3">
          <Badge variant="secondary">{{ result.stats?.candidates_found ?? 0 }} strings found</Badge>
          <Badge variant="outline">{{ result.stats?.total_files ?? 0 }} files scanned</Badge>
        </div>

        <div v-if="result.candidates" class="space-y-2">
          <div
            v-for="(candidate, i) in result.candidates"
            :key="i"
            class="flex items-start gap-3 rounded-lg border border-border bg-card p-4"
          >
            <FileCode class="mt-0.5 size-4 text-muted-foreground shrink-0" />
            <div class="flex-1 min-w-0">
              <div class="font-mono text-xs text-muted-foreground">{{ candidate.file }}:{{ candidate.line }}</div>
              <div class="mt-1 text-sm font-medium text-foreground">"{{ candidate.value }}"</div>
            </div>
            <Badge variant="outline" class="text-[10px]">{{ Math.round(candidate.confidence * 100) }}%</Badge>
          </div>
        </div>
      </div>

      <StudioHint id="normalize" message="Track normalize history and manage extractions in Contentrain Studio." class="mt-6" />
    </div>
  </div>
</template>

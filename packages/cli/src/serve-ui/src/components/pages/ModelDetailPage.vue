<script setup lang="ts">
import { onMounted, computed, watch, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useContentStore, type ModelDescription } from '@/stores/content'
import {
  ArrowLeft,
  Box,
  FileText,
  FileCode,
  BookOpen,
  Hash,
  Languages,
  Database,
  ChevronDown,
  ChevronRight,
  Type,
  ToggleLeft,
  Calendar,
  Image,
  Link,
  List,
  Braces,
  Asterisk,
  Clipboard,
  Check,
  ExternalLink,
} from 'lucide-vue-next'
import PageHeader from '@/components/layout/PageHeader.vue'
import AgentPrompt from '@/components/layout/AgentPrompt.vue'
import AgentPromptGroup from '@/components/layout/AgentPromptGroup.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { copyToClipboard, truncate } from '@/composables/useFormatters'
import { dictionary } from '#contentrain'

const t = dictionary('serve-ui-texts').locale('en').get()

const route = useRoute()
const router = useRouter()
const store = useContentStore()

const modelId = computed(() => route.params.modelId as string)
const model = computed(() => store.modelDescription)
const sampleOpen = ref(false)
const copiedSnippet = ref(false)

const fields = computed(() => {
  if (!model.value?.fields) return []
  return Object.entries(model.value.fields).map(([name, def]) => (Object.assign({name}, def)))
})

const customFields = computed(() =>
  fields.value.filter((f) => !isSystemField(f.name)),
)
const systemFields = computed(() =>
  fields.value.filter((f) => isSystemField(f.name)),
)

function isSystemField(name: string): boolean {
  return ['ID', 'createdAt', 'updatedAt', 'status', 'slug'].includes(name)
}

const importSnippet = computed(() => {
  if (!model.value) return ''
  return `import { createQuery } from '#contentrain'\n\nconst ${model.value.id} = await createQuery('${model.value.id}')\n  .getAll()`
})

const localeEntries = computed(() => {
  if (!model.value?.stats?.locales) return []
  return Object.entries(model.value.stats.locales).map(([locale, count]) => ({
    locale,
    count,
  }))
})

const sampleJson = computed(() => {
  if (!model.value?.sample) return null
  try {
    return JSON.stringify(model.value.sample, null, 2)
  } catch {
    return null
  }
})

// Kind configuration
const kindIcons: Record<string, typeof Box> = {
  collection: Box,
  singleton: FileText,
  document: FileCode,
  dictionary: BookOpen,
}
const kindColors: Record<string, string> = {
  collection: 'bg-primary/10 text-primary',
  singleton: 'bg-sky-500/10 text-sky-600',
  document: 'bg-emerald-500/10 text-emerald-600',
  dictionary: 'bg-amber-500/10 text-amber-600',
}
const kindBadgeColors: Record<string, string> = {
  collection: 'bg-primary/10 text-primary border-primary/20',
  singleton: 'bg-sky-500/10 text-sky-600 border-sky-500/20',
  document: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  dictionary: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
}

// Field type icons
const fieldTypeIcons: Record<string, typeof Type> = {
  string: Type,
  number: Hash,
  boolean: ToggleLeft,
  date: Calendar,
  datetime: Calendar,
  image: Image,
  file: Image,
  video: Image,
  relation: Link,
  relations: Link,
  array: List,
  object: Braces,
  markdown: FileText,
  richtext: FileText,
  color: Braces,
  enum: List,
  url: Link,
  email: Type,
  slug: Link,
}

const fieldTypeColors: Record<string, string> = {
  string: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  number: 'bg-violet-500/10 text-violet-600 border-violet-500/20',
  boolean: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  date: 'bg-orange-500/10 text-orange-600 border-orange-500/20',
  datetime: 'bg-orange-500/10 text-orange-600 border-orange-500/20',
  image: 'bg-pink-500/10 text-pink-600 border-pink-500/20',
  file: 'bg-pink-500/10 text-pink-600 border-pink-500/20',
  video: 'bg-pink-500/10 text-pink-600 border-pink-500/20',
  relation: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  relations: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  array: 'bg-cyan-500/10 text-cyan-600 border-cyan-500/20',
  object: 'bg-slate-500/10 text-slate-600 border-slate-500/20',
  markdown: 'bg-teal-500/10 text-teal-600 border-teal-500/20',
  richtext: 'bg-teal-500/10 text-teal-600 border-teal-500/20',
  enum: 'bg-indigo-500/10 text-indigo-600 border-indigo-500/20',
}

async function handleCopySnippet() {
  const ok = await copyToClipboard(importSnippet.value)
  if (ok) {
    copiedSnippet.value = true
    setTimeout(() => {
      copiedSnippet.value = false
    }, 2000)
  }
}

onMounted(() => {
  store.fetchModelDescription(modelId.value)
})

watch(modelId, (id) => {
  if (id) store.fetchModelDescription(id)
})
</script>

<template>
  <div>
    <PageHeader
      :title="modelId"
      :description="model?.description || `${model?.kind ?? ''} model`"
    >
      <template #actions>
        <Button variant="ghost" size="sm" @click="router.push('/models')">
          <ArrowLeft class="mr-1.5 size-4" />
          {{ t['model-detail.models'] }}
        </Button>
        <Button
          variant="outline"
          size="sm"
          @click="router.push(`/content/${modelId}`)"
        >
          <ExternalLink class="mr-1.5 size-3.5" />
          {{ t['model-detail.view-content'] }}
        </Button>
      </template>
    </PageHeader>

    <div class="px-6 py-6 space-y-6">
      <!-- Loading -->
      <div v-if="store.loading && !model" class="flex justify-center py-16">
        <div class="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>

      <template v-else-if="model">
        <!-- Model metadata section -->
        <div class="rounded-xl border border-border bg-card p-5">
          <div class="flex items-start gap-4">
            <!-- Kind icon -->
            <div
              :class="cn(
                'flex size-12 shrink-0 items-center justify-center rounded-xl',
                kindColors[model.kind] ?? 'bg-muted text-muted-foreground',
              )"
            >
              <component
                :is="kindIcons[model.kind] ?? Hash"
                class="size-6"
              />
            </div>

            <div class="min-w-0 flex-1">
              <!-- Model name and badges -->
              <div class="flex flex-wrap items-center gap-2">
                <h2 class="text-base font-semibold text-foreground">{{ model.id }}</h2>
                <Badge
                  variant="outline"
                  :class="cn(
                    'text-[10px] font-medium',
                    kindBadgeColors[model.kind] ?? '',
                  )"
                >
                  {{ model.kind }}
                </Badge>
                <Badge variant="secondary" class="text-[10px]">
                  {{ model.domain }}
                </Badge>
                <Badge
                  v-if="model.i18n"
                  variant="outline"
                  class="text-[10px] border-sky-500/20 bg-sky-500/10 text-sky-600"
                >
                  <Languages class="mr-1 size-3" />
                  {{ t['model-detail.i18n'] }}
                </Badge>
              </div>

              <!-- Stats row -->
              <div class="mt-3 flex flex-wrap items-center gap-4 text-sm">
                <div class="flex items-center gap-1.5 text-muted-foreground">
                  <Database class="size-3.5" />
                  <span class="font-medium text-foreground">{{ model.stats.total_entries }}</span>
                  <span>{{ model.stats.total_entries === 1 ? 'entry' : 'entries' }}</span>
                </div>

                <span class="size-0.5 rounded-full bg-muted-foreground/40" />

                <div class="flex items-center gap-1.5 text-muted-foreground">
                  <span class="font-medium text-foreground">{{ fields.length }}</span>
                  <span>{{ fields.length === 1 ? 'field' : 'fields' }}</span>
                </div>

                <!-- Locale breakdown -->
                <template v-if="localeEntries.length > 0">
                  <span class="size-0.5 rounded-full bg-muted-foreground/40" />
                  <div class="flex items-center gap-2">
                    <span
                      v-for="entry in localeEntries"
                      :key="entry.locale"
                      class="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
                    >
                      <span class="font-medium text-foreground">{{ entry.locale }}</span>
                      {{ entry.count }}
                    </span>
                  </div>
                </template>
              </div>
            </div>
          </div>
        </div>

        <!-- Agent prompts -->
        <AgentPromptGroup :title="t['model-detail.ask-your-agent']">
          <AgentPrompt :prompt="`Add a 'category' field to ${modelId}`" />
          <AgentPrompt :prompt="`Update ${modelId} to support i18n`" />
          <AgentPrompt :prompt="`Delete the ${modelId} model`" />
          <AgentPrompt :prompt="`Generate 5 sample entries for ${modelId}`" />
        </AgentPromptGroup>

        <!-- Custom fields -->
        <section v-if="customFields.length > 0">
          <h3 class="mb-3 text-sm font-medium text-muted-foreground">
            {{ t['model-detail.fields'] }}
            <span class="ml-1 text-xs text-muted-foreground/60">({{ customFields.length }})</span>
          </h3>
          <div class="space-y-2">
            <div
              v-for="field in customFields"
              :key="field.name"
              class="flex items-center gap-4 rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:bg-accent/30"
            >
              <!-- Field type icon -->
              <div
                :class="cn(
                  'flex size-9 shrink-0 items-center justify-center rounded-lg',
                  fieldTypeColors[field.type] ?? 'bg-muted text-muted-foreground',
                )"
              >
                <component
                  :is="fieldTypeIcons[field.type] ?? Braces"
                  class="size-4"
                />
              </div>

              <!-- Field name -->
              <div class="min-w-0 flex-1">
                <span class="font-mono text-sm font-medium text-foreground">{{ field.name }}</span>
              </div>

              <!-- Type badge -->
              <Badge
                variant="outline"
                :class="cn(
                  'shrink-0 font-mono text-[10px]',
                  fieldTypeColors[field.type] ?? '',
                )"
              >
                {{ field.type }}
              </Badge>

              <!-- Required indicator -->
              <div class="flex w-16 shrink-0 justify-end">
                <span
                  v-if="field.required"
                  class="inline-flex items-center gap-0.5 text-xs font-medium text-status-warning"
                >
                  <Asterisk class="size-3" />
                  {{ t['model-detail.req'] }}
                </span>
                <span v-else class="text-xs text-muted-foreground/40">--</span>
              </div>

              <!-- Default value -->
              <div class="hidden w-32 shrink-0 justify-end sm:flex">
                <span
                  v-if="field.default !== undefined"
                  class="max-w-full truncate rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                >
                  {{ truncate(field.default, 20) }}
                </span>
              </div>
            </div>
          </div>
        </section>

        <!-- System fields -->
        <section v-if="systemFields.length > 0">
          <h3 class="mb-3 text-sm font-medium text-muted-foreground">
            {{ t['model-detail.system-fields'] }}
            <span class="ml-1 text-xs text-muted-foreground/60">({{ systemFields.length }})</span>
          </h3>
          <div class="space-y-2">
            <div
              v-for="field in systemFields"
              :key="field.name"
              class="flex items-center gap-4 rounded-xl border border-border/60 bg-muted/30 px-4 py-3"
            >
              <div class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <component
                  :is="fieldTypeIcons[field.type] ?? Braces"
                  class="size-4"
                />
              </div>
              <div class="min-w-0 flex-1">
                <span class="font-mono text-sm text-muted-foreground">{{ field.name }}</span>
              </div>
              <Badge variant="secondary" class="shrink-0 font-mono text-[10px]">
                {{ field.type }}
              </Badge>
              <div class="flex w-16 shrink-0 justify-end">
                <span
                  v-if="field.required"
                  class="inline-flex items-center gap-0.5 text-xs text-muted-foreground"
                >
                  <Asterisk class="size-3" />
                  {{ t['model-detail.req'] }}
                </span>
                <span v-else class="text-xs text-muted-foreground/40">--</span>
              </div>
              <div class="hidden w-32 shrink-0 justify-end sm:flex">
                <span
                  v-if="field.default !== undefined"
                  class="max-w-full truncate rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                >
                  {{ truncate(field.default, 20) }}
                </span>
              </div>
            </div>
          </div>
        </section>

        <Separator />

        <!-- Import snippet -->
        <section>
          <h3 class="mb-3 text-sm font-medium text-muted-foreground">{{ t['model-detail.import-snippet'] }}</h3>
          <div class="relative rounded-xl border border-border bg-muted/30 p-4">
            <pre class="overflow-x-auto font-mono text-xs leading-relaxed text-foreground"><code>{{ importSnippet }}</code></pre>
            <button
              class="absolute right-3 top-3 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              @click="handleCopySnippet"
            >
              <Check v-if="copiedSnippet" class="size-3.5 text-status-success" />
              <Clipboard v-else class="size-3.5" />
            </button>
          </div>
        </section>

        <!-- Sample data preview -->
        <section v-if="sampleJson">
          <button
            class="mb-3 flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            @click="sampleOpen = !sampleOpen"
          >
            <component
              :is="sampleOpen ? ChevronDown : ChevronRight"
              class="size-4"
            />
            {{ t['model-detail.sample-data'] }}
          </button>
          <div
            v-if="sampleOpen"
            class="rounded-xl border border-border bg-muted/30 p-4"
          >
            <pre class="max-h-80 overflow-auto font-mono text-xs leading-relaxed text-foreground"><code>{{ sampleJson }}</code></pre>
          </div>
        </section>
      </template>
    </div>
  </div>
</template>

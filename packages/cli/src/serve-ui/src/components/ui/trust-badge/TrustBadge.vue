<script setup lang="ts">
import type { HTMLAttributes } from "vue"
import { computed } from "vue"
import { ShieldCheck, AlertTriangle, Ban, Info, Clock } from "lucide-vue-next"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

export interface TrustBadgeProps {
  status: "validated" | "warning" | "blocked" | "partial" | "pending"
  count?: number
  reason?: string
  compact?: boolean
  class?: HTMLAttributes["class"]
}

const props = defineProps<TrustBadgeProps>()

const config = {
  validated: {
    icon: ShieldCheck,
    label: "Validated",
    cls: "border-status-success/30 bg-status-success/10 text-status-success",
  },
  warning: {
    icon: AlertTriangle,
    label: "warnings",
    cls: "border-status-warning/30 bg-status-warning/10 text-status-warning",
  },
  blocked: {
    icon: Ban,
    label: "Blocked",
    cls: "border-status-error/30 bg-status-error/10 text-status-error",
  },
  partial: {
    icon: Info,
    label: "Partial",
    cls: "border-status-info/30 bg-status-info/10 text-status-info",
  },
  pending: {
    icon: Clock,
    label: "Pending review",
    cls: "border-border bg-muted/50 text-muted-foreground",
  },
} as const

const current = computed(() => config[props.status])

const displayText = computed(() => {
  if (props.status === "warning" && props.count !== undefined) {
    return `${props.count} warning${props.count !== 1 ? "s" : ""}`
  }
  return current.value.label
})

const tooltipText = computed(() => {
  if (props.status === "blocked" && props.reason) return props.reason
  if (props.compact) return displayText.value
  return undefined
})
</script>

<template>
  <TooltipProvider v-if="tooltipText">
    <Tooltip>
      <TooltipTrigger as-child>
        <span
          data-slot="trust-badge"
          :class="cn(
            'inline-flex items-center justify-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap shrink-0 transition-colors',
            compact && 'px-1.5',
            current.cls,
            props.class,
          )"
        >
          <component :is="current.icon" class="size-3 shrink-0" />
          <span v-if="!compact">{{ displayText }}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <p class="text-xs">{{ tooltipText }}</p>
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
  <span
    v-else
    data-slot="trust-badge"
    :class="cn(
      'inline-flex items-center justify-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap shrink-0 transition-colors',
      compact && 'px-1.5',
      current.cls,
      props.class,
    )"
  >
    <component :is="current.icon" class="size-3 shrink-0" />
    <span v-if="!compact">{{ displayText }}</span>
  </span>
</template>

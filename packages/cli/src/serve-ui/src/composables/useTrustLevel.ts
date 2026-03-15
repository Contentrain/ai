import { computed, type Ref } from 'vue'
import type { ValidationResult } from '@/stores/content'

export function useTrustLevel(validation: Ref<ValidationResult | null>) {
  const trustStatus = computed(() => {
    if (!validation.value) return 'pending' as const
    const { errors, warnings } = validation.value.summary
    if (errors > 0) return 'warning' as const
    if (warnings > 0) return 'partial' as const
    return 'validated' as const
  })

  const trustCount = computed(() => {
    if (!validation.value) return 0
    return validation.value.summary.errors + validation.value.summary.warnings
  })

  return { trustStatus, trustCount }
}

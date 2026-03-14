import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { useColorMode } from '@vueuse/core'

export const useUiStore = defineStore('ui', () => {
  const colorMode = useColorMode({ attribute: 'class' })
  const sidebarCollapsed = ref(false)
  const dismissedHints = ref<Record<string, number>>(
    JSON.parse(localStorage.getItem('cr-dismissed-hints') ?? '{}'),
  )

  function toggleTheme() {
    colorMode.value = colorMode.value === 'dark' ? 'light' : 'dark'
  }

  function dismissHint(hintId: string) {
    dismissedHints.value[hintId] = Date.now()
    localStorage.setItem('cr-dismissed-hints', JSON.stringify(dismissedHints.value))
  }

  function isHintDismissed(hintId: string): boolean {
    const dismissed = dismissedHints.value[hintId]
    if (!dismissed) return false
    const sevenDays = 7 * 24 * 60 * 60 * 1000
    return Date.now() - dismissed < sevenDays
  }

  watch(sidebarCollapsed, (v) => {
    localStorage.setItem('cr-sidebar-collapsed', String(v))
  })

  const saved = localStorage.getItem('cr-sidebar-collapsed')
  if (saved === 'true') sidebarCollapsed.value = true

  return { colorMode, sidebarCollapsed, toggleTheme, dismissHint, isHintDismissed }
})

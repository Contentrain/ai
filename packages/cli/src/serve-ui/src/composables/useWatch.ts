import { ref, onMounted, onUnmounted } from 'vue'

export interface WSEvent {
  type: 'content:changed' | 'model:changed' | 'config:changed' | 'context:changed' | 'branch:created' | 'branch:merged' | 'validation:updated'
  modelId?: string
  locale?: string
  branch?: string
  context?: unknown
}

type EventHandler = (event: WSEvent) => void

const connected = ref(false)
const lastUpdate = ref<Date | null>(null)
const handlers = new Set<EventHandler>()
let ws: WebSocket | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let reconnectDelay = 1000

function connect() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  ws = new WebSocket(`${protocol}//${window.location.host}/ws`)

  ws.onopen = () => {
    connected.value = true
    reconnectDelay = 1000
  }

  ws.onmessage = (event) => {
    try {
      const data: WSEvent = JSON.parse(event.data)
      lastUpdate.value = new Date()
      for (const handler of handlers) handler(data)
    } catch {
      // ignore malformed messages
    }
  }

  ws.onclose = () => {
    connected.value = false
    scheduleReconnect()
  }

  ws.onerror = () => {
    ws?.close()
  }
}

function scheduleReconnect() {
  if (reconnectTimer) return
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    reconnectDelay = Math.min(reconnectDelay * 2, 30000)
    connect()
  }, reconnectDelay)
}

export function useWatch(handler?: EventHandler) {
  onMounted(() => {
    if (handler) handlers.add(handler)
    connect()
  })

  onUnmounted(() => {
    if (handler) handlers.delete(handler)
  })

  return { connected, lastUpdate }
}

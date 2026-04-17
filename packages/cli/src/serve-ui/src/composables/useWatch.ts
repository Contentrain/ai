import { ref, onMounted, onUnmounted } from 'vue'

export interface WSEvent {
  type:
    | 'connected'
    | 'content:changed'
    | 'model:changed'
    | 'config:changed'
    | 'context:changed'
    | 'meta:changed'
    | 'branch:created'
    | 'branch:merged'
    | 'branch:rejected'
    | 'branch:merge-conflict'
    | 'sync:warning'
    | 'validation:updated'
    | 'normalize:plan-updated'
    | 'file-watch:error'
  modelId?: string
  entryId?: string
  locale?: string
  branch?: string
  skippedCount?: number
  message?: string
  /** ISO timestamp — currently only set on `file-watch:error`. */
  timestamp?: string
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

  ws.addEventListener('open', () => {
    connected.value = true
    reconnectDelay = 1000
  })

  ws.addEventListener('message', (event) => {
    try {
      const data: WSEvent = JSON.parse(event.data)
      lastUpdate.value = new Date()
      for (const handler of handlers) handler(data)
    } catch {
      // ignore malformed messages
    }
  })

  ws.addEventListener('close', () => {
    connected.value = false
    scheduleReconnect()
  })

  ws.addEventListener('error', () => {
    ws?.close()
  })
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

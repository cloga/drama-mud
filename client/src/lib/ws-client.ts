const WS_URL = import.meta.env.VITE_WS_URL ?? `ws://${window.location.host}/ws`

export type WsMessageHandler = (data: Record<string, unknown>) => void

export interface WsClient {
  send: (type: string, payload?: Record<string, unknown>) => void
  disconnect: () => void
}

/** WebSocket client wrapper with auto-reconnect */
export function createWsClient(
  onMessage: WsMessageHandler,
  onConnected?: () => void,
): WsClient {
  let ws: WebSocket | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let intentionalClose = false

  function connect() {
    ws = new WebSocket(WS_URL)

    ws.onopen = () => {
      console.log('[WS] Connected')
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.type === 'connected' && onConnected) {
          onConnected()
        }
        onMessage(data)
      } catch {
        console.warn('[WS] Failed to parse message:', event.data)
      }
    }

    ws.onclose = () => {
      if (intentionalClose) return
      console.log('[WS] Disconnected, reconnecting in 3s...')
      reconnectTimer = setTimeout(connect, 3000)
    }

    ws.onerror = (err) => {
      console.error('[WS] Error:', err)
      ws?.close()
    }
  }

  function send(type: string, payload: Record<string, unknown> = {}) {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type, ...payload }))
    }
  }

  function disconnect() {
    intentionalClose = true
    if (reconnectTimer) clearTimeout(reconnectTimer)
    ws?.close()
    ws = null
  }

  connect()

  return { send, disconnect }
}

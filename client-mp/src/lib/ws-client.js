import Taro from '@tarojs/taro'
import { formatSocketErrorMessage } from './network-errors'

const WS_URL = (TARO_APP_WS_URL ?? 'ws://localhost:3001').replace(/\/$/, '')

export function createWsClient(onMessage, onConnected, onStatusChange) {
  let intentionalClose = false
  let reconnectTimer = null
  let socketTask = null
  let lastNotice = ''

  function emitNotice(type, message) {
    if (lastNotice === message) return
    lastNotice = message
    if (type === 'system') {
      onMessage({ type, content: message })
      return
    }
    onMessage({ type, message })
  }

  function connect() {
    onStatusChange?.(socketTask ? 'reconnecting' : 'connecting')

    Taro.connectSocket({
      url: `${WS_URL}/ws`,
      success() {
        console.log('[WS] Connecting...')
      },
      fail(err) {
        console.error('[WS] Connect failed:', err)
        emitNotice('error', formatSocketErrorMessage(WS_URL, err))
        onStatusChange?.('reconnecting')
        scheduleReconnect()
      },
    }).then((task) => {
      socketTask = task

      task.onOpen(() => {
        lastNotice = ''
        console.log('[WS] Connected')
        onStatusChange?.('connected')
      })

      task.onMessage((res) => {
        try {
          const data = JSON.parse(res.data)
          if (data.type === 'connected' && onConnected) {
            onConnected()
          }
          onMessage(data)
        } catch {
          console.warn('[WS] Failed to parse message:', res.data)
        }
      })

      task.onClose(() => {
        if (intentionalClose) return
        console.log('[WS] Disconnected')
        onStatusChange?.('reconnecting')
        emitNotice('system', '连接已断开，正在重连...')
        scheduleReconnect()
      })

      task.onError((err) => {
        console.error('[WS] Error:', err)
        emitNotice('error', formatSocketErrorMessage(WS_URL, err))
      })
    })
  }

  function scheduleReconnect() {
    if (intentionalClose) return
    console.log('[WS] Reconnecting in 3s...')
    reconnectTimer = setTimeout(connect, 3000)
  }

  function send(type, payload = {}) {
    if (socketTask) {
      socketTask.send({
        data: JSON.stringify({ type, ...payload }),
      })
    }
  }

  function disconnect() {
    intentionalClose = true
    if (reconnectTimer) clearTimeout(reconnectTimer)
    socketTask?.close({})
    socketTask = null
    onStatusChange?.('closed')
  }

  connect()

  return { send, disconnect }
}

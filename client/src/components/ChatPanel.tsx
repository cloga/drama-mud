import { useEffect, useRef, useState } from 'react'
import { createWsClient, type WsClient } from '../lib/ws-client.js'
import { api, type RoomTranscriptMessage } from '../lib/api.js'
import { loadEffectiveGame, parseWorldMarkdown } from '../lib/story-guide.js'
import { RoomStoryPanel } from './RoomStoryPanel.js'

interface ChatPanelProps {
  roomId: string
  playerName: string
  characterId: string
  templateName?: string
  templateDisplayName?: string
  onLeave: () => void
  onRetryCharacterSelect: () => void
}

interface ChatMessage {
  id: string
  sender: string
  content: string
  type: 'player' | 'npc' | 'system'
  timestamp: number
  streaming?: boolean
}

interface PendingTurn {
  turnId: string
  timestamp: number
  playerMessageId: string
  backend: 'agent-runtime' | 'llm'
  runtimeMode?: 'sync'
  hasChunk: boolean
}

interface RoomJoinIntro {
  displayName: string
  backgroundSummary: string
}

export function ChatPanel({
  roomId,
  playerName,
  characterId,
  templateName,
  templateDisplayName,
  onLeave,
  onRetryCharacterSelect,
}: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [joined, setJoined] = useState(false)
  const [joinError, setJoinError] = useState<string | null>(null)
  const [runtimeError, setRuntimeError] = useState<string | null>(null)
  const [showStoryPanel, setShowStoryPanel] = useState(false)
  const [pendingTurns, setPendingTurns] = useState<PendingTurn[]>([])
  const wsRef = useRef<WsClient | null>(null)
  const streamingRef = useRef<Map<string, string>>(new Map())
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const hasJoinedRoomRef = useRef(false)
  const initialEntryModeRef = useRef<'unknown' | 'first' | 'resume'>('unknown')
  const roomJoinIntroRef = useRef<RoomJoinIntro | null>(null)

  const activePendingTurn = pendingTurns[pendingTurns.length - 1] ?? null

  const finalizeStreamingMessages = () => {
    streamingRef.current.clear()
    setMessages((prev) =>
      prev.map((message) => (message.streaming ? { ...message, streaming: false } : message)),
    )
  }

  useEffect(() => {
    let isDisposed = false

    void api
      .getRoomMessages(roomId)
      .then((history) => {
        if (isDisposed) {
          return
        }

        initialEntryModeRef.current = history.messages.length > 0 ? 'resume' : 'first'
        setMessages((prev) => mergeChatMessages(history.messages.map(mapTranscriptMessage), prev))
      })
      .catch((error) => {
        if (isDisposed) {
          return
        }

        initialEntryModeRef.current = 'unknown'
        console.warn('[chat] Failed to load room history:', error)
      })

    void loadEffectiveGame(roomId, templateName)
      .then((game) => {
        if (isDisposed) {
          return
        }

        roomJoinIntroRef.current = summarizeRoomJoinIntro(
          game.worldMd,
          game.displayName || templateDisplayName || templateName || '当前剧本',
        )
      })
      .catch((error) => {
        if (isDisposed) {
          return
        }

        roomJoinIntroRef.current = null
        console.warn('[chat] Failed to load room story intro:', error)
      })

    const ws = createWsClient(
      (data) => {
          const { type } = data

          switch (type) {
            case 'room_joined': {
              setJoined(true)
              setJoinError(null)
              setRuntimeError(null)
              const initialEntryMode = initialEntryModeRef.current
              const isReconnect = hasJoinedRoomRef.current || initialEntryMode === 'resume'
              const joinedContent = isReconnect
                ? `已重新连入，当前角色：${readString(data.characterName, '未知角色')}。`
                : initialEntryMode === 'first'
                  ? buildFirstJoinMessage(data, roomJoinIntroRef.current)
                  : `你已作为 ${readString(data.characterName, '未知角色')} 加入房间。`

              if (!isReconnect) {
                setMessages((prev) => [
                  ...prev,
                  resolveJoinedMessage(data, joinedContent),
                ])
              }
              hasJoinedRoomRef.current = true
              break
            }

            case 'player_msg': {
              setMessages((prev) => [
                ...prev,
                toChatMessage(data, {
                  sender: readString(data.senderName, '玩家'),
                  type: 'player',
                }),
              ])
              break
            }

            case 'npc_turn_start': {
              setPendingTurns((prev) => [
                ...prev.filter((turn) => turn.turnId !== readString(data.turnId)),
                {
                  turnId: readString(data.turnId),
                  timestamp: readTimestamp(data.timestamp),
                  playerMessageId: readString(data.playerMessageId),
                  backend: readBackend(data.backend),
                  runtimeMode: readRuntimeMode(data.runtimeMode),
                  hasChunk: false,
                },
              ])
              break
            }

            case 'npc_chunk': {
              setRuntimeError(null)
              const messageId = readString(data.id)
              const turnId = readString(data.turnId)
              const chunk = readString(data.chunk)
              const current = streamingRef.current.get(messageId) ?? ''
              const updated = current + chunk
              streamingRef.current.set(messageId, updated)
              setPendingTurns((prev) => markTurnHasChunk(prev, turnId))

              setMessages((prev) => {
                const existingIdx = prev.findIndex((message) => message.id === messageId)
                if (existingIdx >= 0) {
                  const copy = [...prev]
                  copy[existingIdx] = {
                    ...copy[existingIdx],
                    content: updated,
                    streaming: true,
                  }
                  return copy
                }

                return [
                  ...prev,
                  {
                    id: messageId || `npc-${Date.now()}`,
                    sender: readString(data.npcName, 'NPC'),
                    content: updated,
                    type: 'npc',
                    timestamp: readTimestamp(data.timestamp),
                    streaming: true,
                  },
                ]
              })
              break
            }

            case 'npc_done': {
              setRuntimeError(null)
              const messageId = readString(data.id)
              const turnId = readString(data.turnId)
              const finalContent = readString(data.content) || streamingRef.current.get(messageId) || '（未生成回复）'
              streamingRef.current.delete(messageId)
              setPendingTurns((prev) => markTurnHasChunk(prev, turnId))

              setMessages((prev) => {
                const existingIdx = prev.findIndex((message) => message.id === messageId)
                if (existingIdx >= 0) {
                  const copy = [...prev]
                  copy[existingIdx] = {
                    ...copy[existingIdx],
                    content: finalContent,
                    streaming: false,
                  }
                  return copy
                }

                return [
                  ...prev,
                  {
                    id: messageId || `npc-${Date.now()}`,
                    sender: readString(data.npcName, 'NPC'),
                    content: finalContent,
                    type: 'npc',
                    timestamp: readTimestamp(data.timestamp),
                  },
                ]
              })
              break
            }

            case 'npc_turn_end': {
              const turnId = readString(data.turnId)
              if (readString(data.status) === 'error') {
                const errorMessage = readString(data.errorMessage)
                if (errorMessage) {
                  setRuntimeError(errorMessage)
                }
              }
              setPendingTurns((prev) => prev.filter((turn) => turn.turnId !== turnId))
              break
            }

            case 'system': {
              setMessages((prev) => [
                ...prev,
                toChatMessage(data, {
                  sender: '系统',
                  type: 'system',
                }),
              ])
              break
            }

            case 'npc_error': {
              const message = readString(data.message)
              setRuntimeError(message)
              finalizeStreamingMessages()
              setMessages((prev) => [
                ...prev,
                toChatMessage(data, {
                  sender: '系统',
                  type: 'system',
                  content: `错误：${message}`,
                }),
              ])
              break
            }

            case 'error': {
              const message = readString(data.message)
              const isJoinError =
                message === '房间不存在' ||
                message === '该角色当前不可选' ||
                message === '游戏模板不存在' ||
                message.startsWith('缺少 ')

              if (isJoinError) {
                setJoinError(message)
              } else {
                setRuntimeError(message)
              }
              finalizeStreamingMessages()
              setMessages((prev) => [
                ...prev,
                toChatMessage(data, {
                  sender: '系统',
                  type: 'system',
                  content: `错误：${message}`,
                }),
              ])
              break
            }
          }
      },
      () => {
        ws.send('join_room', { roomId, playerName, characterId })
      },
      () => {
        if (isDisposed) {
          return
        }

        setJoined(false)
        setPendingTurns([])
        finalizeStreamingMessages()
      },
    )

    wsRef.current = ws

    return () => {
      isDisposed = true
      wsRef.current?.disconnect()
      wsRef.current = null
    }
  }, [characterId, playerName, roomId, templateDisplayName, templateName])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, pendingTurns])

  const handleSend = () => {
    if (!input.trim() || !wsRef.current || !joined || activePendingTurn) return
    setRuntimeError(null)
    wsRef.current.send('player_message', { content: input.trim() })
    setInput('')
  }

  const handleLeave = () => {
    wsRef.current?.send('leave_room')
    wsRef.current?.disconnect()
    onLeave()
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>房间：{roomId.slice(0, 16)}...</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button type="button" onClick={() => setShowStoryPanel((prev) => !prev)}>
            {showStoryPanel ? '收起背景角色' : '查看背景角色'}
          </button>
          <button type="button" onClick={handleLeave}>
            离开房间
          </button>
        </div>
      </div>

      {showStoryPanel && (
        <div style={{ marginTop: 12, marginBottom: 12 }}>
          <RoomStoryPanel
            roomId={roomId}
            templateName={templateName}
            templateDisplayName={templateDisplayName}
            currentCharacterId={characterId}
          />
        </div>
      )}

      {joinError && (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            borderRadius: 12,
            background: 'rgba(127, 29, 29, 0.22)',
            border: '1px solid rgba(248, 113, 113, 0.4)',
          }}
        >
          <p style={{ margin: 0, color: '#fecaca' }}>当前无法直接继续：{joinError}</p>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            {joinError === '该角色当前不可选' && (
              <button onClick={onRetryCharacterSelect} style={{ padding: '8px 14px' }}>
                重新选角色
              </button>
            )}
            <button onClick={handleLeave} style={{ padding: '8px 14px' }}>
              返回大厅
            </button>
          </div>
        </div>
      )}

      {runtimeError && (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            borderRadius: 12,
            background: 'rgba(127, 29, 29, 0.18)',
            border: '1px solid rgba(248, 113, 113, 0.4)',
            color: '#fecaca',
          }}
        >
          最近一次 NPC 回复失败：{runtimeError}
        </div>
      )}

      {activePendingTurn && (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            borderRadius: 12,
            background: 'linear-gradient(180deg, rgba(219, 234, 254, 0.96) 0%, rgba(191, 219, 254, 0.9) 100%)',
            border: '1px solid rgba(59, 130, 246, 0.28)',
            boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.55)',
            color: '#1e3a8a',
          }}
        >
          <div style={{ fontWeight: 600 }}>{activePendingTurn.hasChunk ? 'NPC 回复中...' : 'NPC 思考中...'}</div>
          <div style={{ marginTop: 4, fontSize: 12, color: '#1d4ed8' }}>
            {formatPendingTurn(activePendingTurn, pendingTurns.length)}
          </div>
        </div>
      )}

      {!joined && <p style={{ color: '#ffb74d' }}>连接中...</p>}

      <div
        style={{
          border: '1px solid #333',
          padding: 16,
          height: 400,
          overflowY: 'auto',
          background: '#1a1a1a',
          color: '#e0e0e0',
          fontFamily: 'monospace',
          fontSize: 14,
        }}
      >
        {messages.map((msg) => (
          <div key={msg.id} style={{ marginBottom: 12 }}>
            <div>
              <span style={{ color: getColor(msg.type) }}>
                [{msg.sender}]
                {msg.streaming && <span style={{ color: '#ffb74d' }}> ...</span>}
              </span>{' '}
              {msg.content}
            </div>
            <div style={{ marginTop: 4, fontSize: 11, color: '#94a3b8' }}>{formatDebugMeta(msg.timestamp, msg.id)}</div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div style={{ display: 'flex', marginTop: 8, gap: 8 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder={joined ? (activePendingTurn ? '等待 NPC 回复中...' : '输入消息...') : '连接中...'}
          disabled={!joined || Boolean(activePendingTurn)}
          style={{ flex: 1, padding: 8, fontFamily: 'monospace' }}
        />
        <button onClick={handleSend} disabled={!joined || Boolean(activePendingTurn)} style={{ padding: '8px 16px' }}>
          发送
        </button>
      </div>
    </div>
  )
}

function getColor(type: ChatMessage['type']): string {
  switch (type) {
    case 'player':
      return '#4fc3f7'
    case 'npc':
      return '#ff8a65'
    case 'system':
      return '#bdbdbd'
  }
}

function mapTranscriptMessage(message: RoomTranscriptMessage): ChatMessage {
  return {
    id: message.id,
    sender: message.senderName,
    content: message.content,
    type: message.type,
    timestamp: message.timestamp,
  }
}

function toChatMessage(
  payload: Record<string, unknown>,
  options: { sender: string; type: ChatMessage['type']; content?: string; streaming?: boolean },
): ChatMessage {
  const timestamp = readTimestamp(payload.timestamp)

  return {
    id: readString(payload.id, `fallback-${options.type}-${timestamp}`),
    sender: options.sender,
    content: readString(payload.content, options.content ?? ''),
    type: options.type,
    timestamp,
    streaming: options.streaming,
  }
}

function resolveJoinedMessage(data: Record<string, unknown>, fallbackContent: string): ChatMessage {
  const joinedMessage = readRecord(data.joinedMessage)
  if (!joinedMessage) {
    return {
      id: `join-${Date.now()}`,
      sender: '系统',
      content: fallbackContent,
      type: 'system',
      timestamp: Date.now(),
    }
  }

  return {
    id: readString(joinedMessage.id, `join-${Date.now()}`),
    sender: '系统',
    content: fallbackContent,
    type: 'system',
    timestamp: readTimestamp(joinedMessage.timestamp),
  }
}

function mergeChatMessages(base: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const merged = new Map<string, ChatMessage>()

  for (const message of base) {
    merged.set(message.id, message)
  }

  for (const message of incoming) {
    merged.set(message.id, message)
  }

  return [...merged.values()].sort((left, right) => left.timestamp - right.timestamp)
}

function summarizeRoomJoinIntro(worldMd: string, fallbackDisplayName: string): RoomJoinIntro {
  const blocks = parseWorldMarkdown(worldMd)
  const summaryBlock = blocks.find((block) => block.type !== 'title')
  let displayName = fallbackDisplayName

  for (const block of blocks) {
    if (block.type === 'title' && 'content' in block) {
      displayName = block.content
      break
    }
  }

  return {
    displayName,
    backgroundSummary: truncateText(extractBlockText(summaryBlock) || '故事即将开始。', 88),
  }
}

function buildFirstJoinMessage(data: Record<string, unknown>, intro: RoomJoinIntro | null): string {
  const characterName = readString(data.characterName, '未知角色')
  const characters = readCharacterSummaries(data.characters)
  const playableCharacters = summarizeCharacterList(
    characters.filter((character) => !character.isNpc).map((character) => character.name),
  )
  const npcCharacters = summarizeCharacterList(
    characters.filter((character) => character.isNpc).map((character) => character.name),
  )

  const parts = [
    `欢迎进入《${intro?.displayName ?? '当前剧本'}》。`,
    `你当前扮演：${characterName}。`,
    `背景：${intro?.backgroundSummary ?? '故事即将开始。'}`,
  ]

  if (playableCharacters) {
    parts.push(`可扮演角色：${playableCharacters}。`)
  }

  if (npcCharacters) {
    parts.push(`本局 NPC：${npcCharacters}。`)
  }

  parts.push('右上角可随时查看完整背景角色。')
  return parts.join(' ')
}

function readCharacterSummaries(value: unknown): Array<{ name: string; isNpc: boolean }> {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((item) => readRecord(item))
    .filter((item): item is Record<string, unknown> => item !== null)
    .map((item) => ({
      name: readString(item.name),
      isNpc: item.isNpc === true,
    }))
    .filter((item) => item.name)
}

function summarizeCharacterList(names: string[]): string {
  if (names.length === 0) {
    return ''
  }

  if (names.length <= 4) {
    return names.join('、')
  }

  return `${names.slice(0, 4).join('、')} 等 ${names.length} 位`
}

function extractBlockText(block: ReturnType<typeof parseWorldMarkdown>[number] | undefined): string {
  if (!block) {
    return ''
  }

  switch (block.type) {
    case 'title':
    case 'heading':
    case 'paragraph':
    case 'quote':
      return block.content
    case 'list':
      return block.items.join('；')
  }
}

function truncateText(text: string, maxLength: number): string {
  const normalized = text.trim()
  if (normalized.length <= maxLength) {
    return normalized
  }

  return `${normalized.slice(0, maxLength - 1)}…`
}

function markTurnHasChunk(turns: PendingTurn[], turnId: string): PendingTurn[] {
  return turns.map((turn) => (turn.turnId === turnId ? { ...turn, hasChunk: true } : turn))
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null
}

function readString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function readTimestamp(value: unknown, fallback = Date.now()): number {
  return typeof value === 'number' ? value : fallback
}

function readBackend(value: unknown): PendingTurn['backend'] {
  return value === 'agent-runtime' ? 'agent-runtime' : 'llm'
}

function readRuntimeMode(value: unknown): PendingTurn['runtimeMode'] {
  return value === 'sync' ? 'sync' : undefined
}

function formatDebugMeta(timestamp: number, id: string): string {
  return `${formatTimestamp(timestamp)} · ${shortId(id)}`
}

function formatPendingTurn(turn: PendingTurn, pendingCount: number): string {
  const backendLabel = turn.runtimeMode ? `${turn.backend}/${turn.runtimeMode}` : turn.backend
  const queueLabel = pendingCount > 1 ? ` · 还有 ${pendingCount - 1} 轮等待中` : ''
  return `${formatTimestamp(turn.timestamp)} · ${shortId(turn.turnId)} · ${backendLabel}${queueLabel}`
}

function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('zh-CN', { hour12: false })
}

function shortId(id: string): string {
  if (id.length <= 18) {
    return id
  }

  return `${id.slice(0, 10)}...${id.slice(-6)}`
}

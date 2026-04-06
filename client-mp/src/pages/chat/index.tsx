// @ts-nocheck
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { View, Text, ScrollView, Input, Button } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import { api } from '../../lib/api'
import { clearStoredSession, getStoredSession, setStoredSession } from '../../lib/session'
import { formatWorldMd } from '../../lib/story-guide'
import { createWsClient } from '../../lib/ws-client'
import './index.css'

export default function Chat() {
  const h = React.createElement
  const router = useRouter()
  const storedSession = getStoredSession()
  const routeParams = router.params || {}
  const roomId = routeParams.roomId || storedSession?.roomId || ''
  const templateName = routeParams.templateName || storedSession?.templateName || ''
  const encodedPlayerName = routeParams.playerName || encodeURIComponent(storedSession?.playerName || '')
  const characterId = routeParams.characterId || storedSession?.characterId || ''
  const decodedPlayerName = decodeURIComponent(encodedPlayerName || '')

  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [joined, setJoined] = useState(false)
  const [pageError, setPageError] = useState(null)
  const [joinError, setJoinError] = useState(null)
  const [runtimeError, setRuntimeError] = useState(null)
  const [connectionState, setConnectionState] = useState('connecting')
  const [showStoryGuide, setShowStoryGuide] = useState(false)
  const [storyGuide, setStoryGuide] = useState(null)
  const [guideLoading, setGuideLoading] = useState(false)
  const [guideError, setGuideError] = useState(null)
  const [pendingTurns, setPendingTurns] = useState([])
  const wsRef = useRef(null)
  const streamingRef = useRef(new Map())
  const scrollId = useRef(`msg-bottom-${Date.now()}`)
  const hasJoinedRoomRef = useRef(false)

  const activePendingTurn = pendingTurns[pendingTurns.length - 1] ?? null

  useEffect(() => {
    if (!roomId || !decodedPlayerName || !characterId) {
      setPageError('缺少房间信息，请返回大厅重新进入或创建房间。')
      return
    }

    let active = true

    async function boot() {
      setStoredSession({
        roomId,
        playerName: decodedPlayerName,
        characterId,
        templateName,
      })

      try {
        const history = await api.getRoomMessages(roomId)
        if (active) {
          setMessages(history.messages.map(mapTranscriptMessage))
        }
      } catch (error) {
        if (active) {
          console.warn('[chat-mp] Failed to load room history:', error)
          setMessages([])
        }
      }

      if (!active) {
        return
      }

      const ws = createWsClient(
        (data) => {
          const { type } = data

          switch (type) {
            case 'room_joined': {
              setJoined(true)
              setJoinError(null)
              setRuntimeError(null)
              setConnectionState('connected')
              setStoredSession({
                roomId,
                playerName: decodedPlayerName,
                characterId,
                templateName,
              })
              setMessages((prev) => [
                ...prev,
                resolveJoinedMessage(
                  data,
                  hasJoinedRoomRef.current
                    ? `已重新连入，当前角色：${readString(data.characterName, '未知角色')}。`
                    : `你已作为 ${readString(data.characterName, '未知角色')} 加入房间。`,
                ),
              ])
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
              finalizeStreamingMessages(setMessages, streamingRef)
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
              const isJoinFailure =
                message === '房间不存在' ||
                message === '该角色当前不可选' ||
                message === '游戏模板不存在' ||
                message.startsWith('缺少 ')

              if (isJoinFailure) {
                setJoinError(message)
              } else {
                setRuntimeError(message)
              }
              finalizeStreamingMessages(setMessages, streamingRef)
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
          ws.send('join_room', { roomId, playerName: decodedPlayerName, characterId })
        },
        (status) => {
          setConnectionState(status)
          if (status === 'reconnecting') {
            setJoined(false)
          }
        },
      )

      wsRef.current = ws
    }

    void boot()

    return () => {
      active = false
      wsRef.current?.disconnect()
      wsRef.current = null
    }
  }, [characterId, decodedPlayerName, roomId, templateName])

  useEffect(() => {
    if (!showStoryGuide || !roomId || guideLoading || storyGuide) {
      return
    }

    let active = true
    setGuideLoading(true)
    setGuideError(null)

    api
      .getRoomGameDetail(roomId, templateName)
      .then((game) => {
        if (!active) {
          return
        }
        setStoryGuide(game)
        setGuideLoading(false)
      })
      .catch((error) => {
        if (!active) {
          return
        }
        setGuideError(error instanceof Error ? error.message : String(error))
        setGuideLoading(false)
      })

    return () => {
      active = false
    }
  }, [guideLoading, roomId, showStoryGuide, storyGuide, templateName])

  const handleSend = () => {
    if (!input.trim() || !wsRef.current || !joined || activePendingTurn) return
    setRuntimeError(null)
    wsRef.current.send('player_message', { content: input.trim() })
    setInput('')
  }

  const handleLeave = () => {
    clearStoredSession()
    wsRef.current?.send('leave_room')
    wsRef.current?.disconnect()
    Taro.reLaunch({ url: '/pages/lobby/index' })
  }

  const introBlocks = useMemo(() => formatWorldMd(storyGuide?.worldMd || ''), [storyGuide?.worldMd])
  const playableCharacters = storyGuide?.characters?.filter((item) => !item.isNpc) ?? []
  const npcCharacters = storyGuide?.characters?.filter((item) => item.isNpc) ?? []

  if (pageError) {
    return h(
      View,
      { className: 'chat-page' },
      h(Text, { className: 'error-text' }, pageError),
      h(
        Button,
        { onClick: () => Taro.reLaunch({ url: '/pages/lobby/index' }) },
        '返回大厅',
      ),
    )
  }

  return h(
    View,
    { className: 'chat-page' },
    h(
      View,
      { className: 'chat-header', key: 'header' },
      h(Text, { className: 'chat-room-id' }, `房间：${roomId?.slice(0, 16)}...`),
      h(
        View,
        { className: 'chat-header-actions' },
        h(
          Button,
          {
            className: 'header-btn',
            size: 'mini',
            onClick: () => setShowStoryGuide((prev) => !prev),
          },
          showStoryGuide ? '收起资料' : '背景角色',
        ),
        h(Button, { className: 'leave-btn', size: 'mini', onClick: handleLeave }, '离开'),
      ),
    ),
    !joined
      ? h(
          Text,
          { className: 'connecting-text', key: 'connecting' },
          connectionState === 'reconnecting' ? '重连中...' : '连接中...',
        )
      : null,
    joinError
      ? h(
          View,
          { className: 'status-card status-card--error', key: 'join-error' },
          h(Text, { className: 'status-card-text' }, `当前无法直接继续：${joinError}`),
          h(
            Button,
            {
              className: 'status-card-button',
              size: 'mini',
              onClick: () => Taro.reLaunch({ url: '/pages/lobby/index' }),
            },
            '返回大厅',
          ),
        )
      : null,
    runtimeError
      ? h(
          View,
          { className: 'status-card status-card--error', key: 'runtime-error' },
          h(Text, { className: 'status-card-text' }, `最近一次 NPC 回复失败：${runtimeError}`),
        )
      : null,
    activePendingTurn
      ? h(
          View,
          { className: 'status-card status-card--pending', key: 'pending-turn' },
          h(Text, { className: 'status-card-text' }, activePendingTurn.hasChunk ? 'NPC 回复中...' : 'NPC 思考中...'),
          h(Text, { className: 'status-card-meta' }, formatPendingTurn(activePendingTurn, pendingTurns.length)),
        )
      : null,
    showStoryGuide
      ? h(
          View,
          { className: 'story-guide-card', key: 'story-guide' },
          guideLoading
            ? h(Text, { className: 'story-guide-status' }, '正在加载故事背景与角色...')
            : guideError
              ? h(Text, { className: 'story-guide-error' }, `加载失败：${guideError}`)
              : [
                  h(Text, { className: 'story-guide-title', key: 'story-guide-title' }, '故事背景与角色'),
                  storyGuide?.displayName
                    ? h(
                        Text,
                        { className: 'story-guide-subtitle', key: 'story-guide-subtitle' },
                        `剧本：${storyGuide.displayName}`,
                      )
                    : null,
                  ...introBlocks.map((block, index) => {
                    if (block.type === 'title') {
                      return h(Text, { key: `guide-title-${index}`, className: 'script-intro-title' }, block.content)
                    }
                    if (block.type === 'heading') {
                      return h(Text, { key: `guide-heading-${index}`, className: 'script-intro-heading' }, block.content)
                    }
                    if (block.type === 'item') {
                      return h(
                        View,
                        { key: `guide-item-${index}`, className: 'script-intro-item' },
                        h(Text, { className: 'script-intro-bullet' }, '•'),
                        h(Text, { className: 'script-intro-item-text' }, block.content),
                      )
                    }
                    return h(
                      Text,
                      { key: `guide-paragraph-${index}`, className: 'script-intro-paragraph' },
                      block.content,
                    )
                  }),
                  h(Text, { className: 'story-guide-section', key: 'playable-title' }, '可扮演角色'),
                  ...playableCharacters.map((character) =>
                    h(
                      View,
                      {
                        key: character.id,
                        className: `char-card char-card--playable${character.id === characterId ? ' char-card--current' : ''}`,
                      },
                      h(
                        Text,
                        { className: 'char-name' },
                        `${character.id === characterId ? '✅' : '🎭'} ${character.name}`,
                      ),
                      h(Text, { className: 'char-desc' }, character.description),
                      h(Text, { className: 'char-personality' }, character.personality),
                    ),
                  ),
                  ...(npcCharacters.length > 0
                    ? [
                        h(Text, { className: 'story-guide-section', key: 'npc-title' }, 'NPC 角色'),
                        ...npcCharacters.map((character) =>
                          h(
                            View,
                            {
                              key: character.id,
                              className: 'char-card char-card--npc',
                            },
                            h(Text, { className: 'char-name' }, `🤖 ${character.name}`),
                            h(Text, { className: 'char-desc' }, character.description),
                            h(Text, { className: 'char-personality' }, character.personality),
                          ),
                        ),
                      ]
                    : []),
                ],
        )
      : null,
    h(
      ScrollView,
      {
        className: 'chat-scroll',
        scrollY: true,
        scrollIntoView: `msg-${messages.length - 1}`,
        scrollWithAnimation: true,
        key: 'scroll',
      },
      ...messages.map((message, idx) =>
        h(
          View,
          { key: message.id, id: `msg-${idx}`, className: 'chat-msg' },
          h(
            Text,
            { className: `msg-sender msg-sender--${message.type}` },
            `[${message.sender}]${message.streaming ? ' ...' : ''}`,
          ),
          h(Text, { className: 'msg-content' }, ` ${message.content}`),
          h(Text, { className: 'msg-meta' }, formatDebugMeta(message.timestamp, message.id)),
        ),
      ),
      h(View, { id: scrollId.current, key: 'scroll-anchor' }),
    ),
    h(
      View,
      { className: 'chat-input-bar', key: 'input-bar' },
      h(Input, {
        className: 'chat-input',
        value: input,
        onInput: (e) => setInput(e.detail.value),
        onConfirm: handleSend,
        placeholder: joined ? (activePendingTurn ? '等待 NPC 回复中...' : '输入消息...') : connectionState === 'reconnecting' ? '重连中...' : '连接中...',
        disabled: !joined || Boolean(activePendingTurn),
        confirmType: 'send',
      }),
      h(
        Button,
        { className: 'send-btn', size: 'mini', onClick: handleSend, disabled: !joined || Boolean(activePendingTurn) },
        '发送',
      ),
    ),
  )
}

function finalizeStreamingMessages(setMessages, streamingRef) {
  streamingRef.current.clear()
  setMessages((prev) =>
    prev.map((message) => (message.streaming ? { ...message, streaming: false } : message)),
  )
}

function mapTranscriptMessage(message) {
  return {
    id: message.id,
    sender: message.senderName,
    content: message.content,
    type: message.type,
    timestamp: message.timestamp,
  }
}

function toChatMessage(payload, options) {
  const timestamp = readTimestamp(payload.timestamp)

  return {
    id: readString(payload.id, `fallback-${options.type}-${timestamp}`),
    sender: options.sender,
    content: readString(payload.content, options.content || ''),
    type: options.type,
    timestamp,
    streaming: options.streaming,
  }
}

function resolveJoinedMessage(data, fallbackContent) {
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

function markTurnHasChunk(turns, turnId) {
  return turns.map((turn) => (turn.turnId === turnId ? { ...turn, hasChunk: true } : turn))
}

function readRecord(value) {
  return typeof value === 'object' && value !== null ? value : null
}

function readString(value, fallback = '') {
  return typeof value === 'string' ? value : fallback
}

function readTimestamp(value, fallback = Date.now()) {
  return typeof value === 'number' ? value : fallback
}

function readBackend(value) {
  return value === 'agent-runtime' ? 'agent-runtime' : 'llm'
}

function readRuntimeMode(value) {
  return value === 'sync' ? 'sync' : undefined
}

function formatPendingTurn(turn, pendingCount) {
  const backendLabel = turn.runtimeMode ? `${turn.backend}/${turn.runtimeMode}` : turn.backend
  const queueLabel = pendingCount > 1 ? ` · 还有 ${pendingCount - 1} 轮等待中` : ''
  return `${formatTimestamp(turn.timestamp)} · ${shortId(turn.turnId)} · ${backendLabel}${queueLabel}`
}

function formatDebugMeta(timestamp, id) {
  return `${formatTimestamp(timestamp)} · ${shortId(id)}`
}

function formatTimestamp(timestamp) {
  return new Date(timestamp).toLocaleTimeString('zh-CN', { hour12: false })
}

function shortId(id) {
  if (id.length <= 18) {
    return id
  }

  return `${id.slice(0, 10)}...${id.slice(-6)}`
}

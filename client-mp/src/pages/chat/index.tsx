// @ts-nocheck
import React, { useEffect, useRef, useState } from 'react'
import { View, Text, ScrollView, Input, Button } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import { clearStoredSession, getStoredSession, setStoredSession } from '../../lib/session'
import { createWsClient } from '../../lib/ws-client'
import './index.css'

export default function Chat() {
  const h = React.createElement
  const router = useRouter()
  const storedSession = getStoredSession()
  const routeParams = router.params || {}
  const roomId = routeParams.roomId || storedSession?.roomId || ''
  const encodedPlayerName = routeParams.playerName || encodeURIComponent(storedSession?.playerName || '')
  const characterId = routeParams.characterId || storedSession?.characterId || ''
  const decodedPlayerName = decodeURIComponent(encodedPlayerName || '')

  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [joined, setJoined] = useState(false)
  const [pageError, setPageError] = useState(null)
  const [connectionState, setConnectionState] = useState('connecting')
  const wsRef = useRef(null)
  const streamingRef = useRef(new Map())
  const scrollId = useRef(`msg-bottom-${Date.now()}`)
  const hasJoinedRoomRef = useRef(false)

  useEffect(() => {
    if (!roomId || !decodedPlayerName || !characterId) {
      setPageError('缺少房间信息，请返回大厅重新进入或创建房间。')
      return
    }

    setStoredSession({
      roomId,
      playerName: decodedPlayerName,
      characterId,
      templateName: storedSession?.templateName,
    })

    const ws = createWsClient(
      (data) => {
        const { type } = data

        switch (type) {
          case 'room_joined': {
            setJoined(true)
            setConnectionState('connected')
            setStoredSession({
              roomId,
              playerName: decodedPlayerName,
              characterId,
              templateName: storedSession?.templateName,
            })
            setMessages((prev) => [
              ...prev,
              {
                id: `sys-${Date.now()}`,
                sender: '系统',
                content: hasJoinedRoomRef.current
                  ? `已重新连入，当前角色：${data.characterName}。`
                  : `你已作为 ${data.characterName} 加入房间。`,
                type: 'system',
              },
            ])
            hasJoinedRoomRef.current = true
            break
          }

          case 'player_msg': {
            setMessages((prev) => [
              ...prev,
              {
                id: `msg-${Date.now()}-${Math.random()}`,
                sender: data.senderName,
                content: data.content,
                type: 'player',
              },
            ])
            break
          }

          case 'npc_chunk': {
            const npcId = data.npcId
            const npcName = data.npcName
            const chunk = data.chunk
            const current = streamingRef.current.get(npcId) ?? ''
            const updated = current + chunk
            streamingRef.current.set(npcId, updated)

            setMessages((prev) => {
              const existingIdx = prev.findIndex((message) => message.id === `npc-stream-${npcId}` && message.streaming)
              if (existingIdx >= 0) {
                const copy = [...prev]
                copy[existingIdx] = { ...copy[existingIdx], content: updated }
                return copy
              }
              return [
                ...prev,
                {
                  id: `npc-stream-${npcId}`,
                  sender: npcName,
                  content: updated,
                  type: 'npc',
                  streaming: true,
                },
              ]
            })
            break
          }

          case 'npc_done': {
            const npcId = data.npcId
            const finalContent = streamingRef.current.get(npcId) ?? ''
            streamingRef.current.delete(npcId)

            setMessages((prev) =>
              prev.map((message) =>
                message.id === `npc-stream-${npcId}` ? { ...message, content: finalContent, streaming: false } : message,
              ),
            )
            break
          }

          case 'system': {
            setMessages((prev) => [
              ...prev,
              {
                id: `sys-${Date.now()}-${Math.random()}`,
                sender: '系统',
                content: data.content,
                type: 'system',
              },
            ])
            break
          }

          case 'error': {
            setMessages((prev) => [
              ...prev,
              {
                id: `err-${Date.now()}`,
                sender: '系统',
                content: `错误：${data.message}`,
                type: 'system',
              },
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

    return () => {
      ws.disconnect()
    }
  }, [characterId, decodedPlayerName, roomId, storedSession?.templateName])

  const handleSend = () => {
    if (!input.trim() || !wsRef.current || !joined) return
    wsRef.current.send('player_message', { content: input.trim() })
    setInput('')
  }

  const handleLeave = () => {
    clearStoredSession()
    wsRef.current?.send('leave_room')
    wsRef.current?.disconnect()
    Taro.reLaunch({ url: '/pages/lobby/index' })
  }

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
      h(Button, { className: 'leave-btn', size: 'mini', onClick: handleLeave }, '离开'),
    ),
    !joined
      ? h(
          Text,
          { className: 'connecting-text', key: 'connecting' },
          connectionState === 'reconnecting' ? '重连中...' : '连接中...',
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
        placeholder: joined ? '输入消息...' : connectionState === 'reconnecting' ? '重连中...' : '连接中...',
        disabled: !joined,
        confirmType: 'send',
      }),
      h(
        Button,
        { className: 'send-btn', size: 'mini', onClick: handleSend, disabled: !joined },
        '发送',
      ),
    ),
  )
}

import { useState, useEffect, useRef } from 'react'
import { createWsClient, type WsClient } from '../lib/ws-client.js'

interface ChatPanelProps {
  roomId: string
  playerName: string
  characterId: string
  onLeave: () => void
}

interface ChatMessage {
  id: string
  sender: string
  content: string
  type: 'player' | 'npc' | 'system'
  streaming?: boolean
}

export function ChatPanel({ roomId, playerName, characterId, onLeave }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [joined, setJoined] = useState(false)
  const wsRef = useRef<WsClient | null>(null)
  const streamingRef = useRef<Map<string, string>>(new Map())
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const ws = createWsClient(
      (data) => {
        const { type } = data

        switch (type) {
          case 'room_joined': {
            setJoined(true)
            setMessages((prev) => [
              ...prev,
                {
                  id: `sys-${Date.now()}`,
                  sender: '系统',
                  content: `你已作为 ${data.characterName as string} 加入房间。`,
                  type: 'system',
                },
            ])
            break
          }

          case 'player_msg': {
            setMessages((prev) => [
              ...prev,
              {
                id: `msg-${Date.now()}-${Math.random()}`,
                sender: data.senderName as string,
                content: data.content as string,
                type: 'player',
              },
            ])
            break
          }

          case 'npc_chunk': {
            const npcId = data.npcId as string
            const npcName = data.npcName as string
            const chunk = data.chunk as string
            const current = streamingRef.current.get(npcId) ?? ''
            const updated = current + chunk
            streamingRef.current.set(npcId, updated)

            setMessages((prev) => {
              const existingIdx = prev.findIndex((m) => m.id === `npc-stream-${npcId}` && m.streaming)
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
            const npcId = data.npcId as string
            const finalContent = streamingRef.current.get(npcId) ?? ''
            streamingRef.current.delete(npcId)

            setMessages((prev) =>
              prev.map((m) =>
                m.id === `npc-stream-${npcId}` ? { ...m, content: finalContent, streaming: false } : m,
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
                  content: data.content as string,
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
                  content: `错误：${data.message as string}`,
                  type: 'system',
                },
            ])
            break
          }
        }
      },
      () => {
        // Server sends 'connected' on socket open — now we join the room
        ws.send('join_room', { roomId, playerName, characterId })
      },
    )

    wsRef.current = ws

    return () => {
      ws.disconnect()
    }
  }, [roomId, playerName, characterId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = () => {
    if (!input.trim() || !wsRef.current || !joined) return
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
        <button onClick={handleLeave}>离开房间</button>
      </div>

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
          <div key={msg.id} style={{ marginBottom: 8 }}>
            <span style={{ color: getColor(msg.type) }}>
              [{msg.sender}]
              {msg.streaming && <span style={{ color: '#ffb74d' }}> ...</span>}
            </span>{' '}
            {msg.content}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div style={{ display: 'flex', marginTop: 8, gap: 8 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder={joined ? '输入消息...' : '连接中...'}
          disabled={!joined}
          style={{ flex: 1, padding: 8, fontFamily: 'monospace' }}
        />
        <button onClick={handleSend} disabled={!joined} style={{ padding: '8px 16px' }}>
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

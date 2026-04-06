import type { FastifyInstance } from 'fastify'
import type { WebSocket } from 'ws'
import type { LlmClient } from '@drama-mud/engine'
import { RoomManager } from '../rooms/room-manager.js'
import { GameSession } from '../session/game-session.js'
import { loadGameTemplates, type GameTemplate } from '../api/game-loader.js'

/** Per-socket state */
interface SocketState {
  playerId: string
  roomId?: string
}

/** All active game sessions keyed by roomId */
const sessions = new Map<string, GameSession>()

/** All sockets in a room, for broadcasting */
const roomSockets = new Map<string, Set<WebSocket>>()

let templateCache: GameTemplate[] | null = null

async function getTemplates(): Promise<GameTemplate[]> {
  if (!templateCache) templateCache = await loadGameTemplates()
  return templateCache
}

function send(socket: WebSocket, type: string, payload: Record<string, unknown>) {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify({ type, ...payload }))
  }
}

function broadcast(roomId: string, type: string, payload: Record<string, unknown>, exclude?: WebSocket) {
  const sockets = roomSockets.get(roomId)
  if (!sockets) return
  const msg = JSON.stringify({ type, ...payload })
  for (const s of sockets) {
    if (s !== exclude && s.readyState === s.OPEN) {
      s.send(msg)
    }
  }
}

export function registerWsHandler(app: FastifyInstance, roomManager: RoomManager, llmClient: LlmClient) {
  app.register(async (fastify) => {
    fastify.get('/ws', { websocket: true }, (socket: WebSocket, _request) => {
      const state: SocketState = {
        playerId: `player-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      }

      send(socket, 'connected', { message: '欢迎来到戏精日记！' })

      socket.on('message', (rawMessage: Buffer | ArrayBuffer | Buffer[]) => {
        let data: Record<string, unknown>
        try {
          data = JSON.parse(rawMessage.toString())
        } catch {
          send(socket, 'error', { message: '消息格式无效' })
          return
        }
        handleMessage(socket, state, data, roomManager, llmClient).catch((err) => {
          console.error('WS handler error:', err)
          send(socket, 'error', { message: '服务器内部错误' })
        })
      })

      socket.on('close', () => {
        if (state.roomId) {
          const sockets = roomSockets.get(state.roomId)
          if (sockets) {
            sockets.delete(socket)
            if (sockets.size === 0) roomSockets.delete(state.roomId)
          }
          const session = sessions.get(state.roomId)
          if (session) {
            const player = session.getPlayer(state.playerId)
            session.removePlayer(state.playerId)
            if (player) {
              broadcast(state.roomId, 'system', { content: `${player.name} 离开了房间。` })
            }
          }
        }
      })
    })
  })
}

async function handleMessage(
  socket: WebSocket,
  state: SocketState,
  data: Record<string, unknown>,
  roomManager: RoomManager,
  llmClient: LlmClient,
) {
  const { type } = data

  switch (type) {
    case 'join_room': {
      const roomId = data.roomId as string
      const playerName = data.playerName as string
      const characterId = data.characterId as string

      if (!roomId || !playerName || !characterId) {
        send(socket, 'error', { message: '缺少 roomId、playerName 或 characterId' })
        return
      }

      const room = roomManager.getRoom(roomId)
      if (!room) {
        send(socket, 'error', { message: '房间不存在' })
        return
      }

      // Create session if first player joining
      let session = sessions.get(roomId)
      if (!session) {
        const templates = await getTemplates()
        const template = templates.find((t) => t.config.name === room.gameTemplate)
        if (!template) {
          send(socket, 'error', { message: '游戏模板不存在' })
          return
        }
        session = new GameSession(roomId, template.config, template.characters, template.worldMd, llmClient)
        sessions.set(roomId, session)
      }

      // Assign character
      const char = session.assignCharacter(state.playerId, playerName, characterId)
      if (!char) {
        send(socket, 'error', { message: '该角色当前不可选' })
        return
      }

      state.roomId = roomId
      room.addPlayer(playerName)
      room.start()

      // Track socket in room
      if (!roomSockets.has(roomId)) roomSockets.set(roomId, new Set())
      roomSockets.get(roomId)!.add(socket)

      send(socket, 'room_joined', {
        roomId,
        characterName: char.name,
        characters: session.characters.map((c) => ({
          id: c.id,
          name: c.name,
          description: c.description,
          isNpc: c.isNpc,
        })),
      })

      broadcast(roomId, 'system', { content: `${playerName} 以 ${char.name} 的身份加入了房间。` }, socket)
      break
    }

    case 'player_message': {
      const content = data.content as string
      if (!content || !state.roomId) {
        send(socket, 'error', { message: '你尚未加入房间，或消息为空' })
        return
      }

      const session = sessions.get(state.roomId)
      if (!session) return

      const player = session.getPlayer(state.playerId)
      if (!player) return

      // Broadcast the player's message to all in room
      broadcast(state.roomId, 'player_msg', { senderName: player.characterName, content })

      // Generate NPC response with streaming
      await session.handlePlayerMessage(
        state.playerId,
        content,
        (npcId, npcName, chunk) => {
          broadcast(state.roomId!, 'npc_chunk', { npcId, npcName, chunk })
        },
        (npcId, npcName) => {
          broadcast(state.roomId!, 'npc_done', { npcId, npcName })
        },
      )
      break
    }

    case 'leave_room': {
      if (state.roomId) {
        const sockets = roomSockets.get(state.roomId)
        if (sockets) {
          sockets.delete(socket)
          if (sockets.size === 0) roomSockets.delete(state.roomId)
        }
        const session = sessions.get(state.roomId)
        if (session) {
          const player = session.getPlayer(state.playerId)
          session.removePlayer(state.playerId)
          if (player) {
            broadcast(state.roomId, 'system', { content: `${player.name} 离开了房间。` })
          }
        }
        state.roomId = undefined
      }
      send(socket, 'system', { content: '你已离开房间。' })
      break
    }

    default:
      send(socket, 'error', { message: `未知消息类型：${type}` })
  }
}

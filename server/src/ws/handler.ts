import type { FastifyInstance } from 'fastify'
import type { WebSocket } from 'ws'
import { createMessageMetadata, type LlmClient, type Message } from '@drama-mud/engine'
import { RoomManager } from '../rooms/room-manager.js'
import { GameSession } from '../session/game-session.js'
import type { NpcTurnAdapter } from '../runtime/optimus-runtime.js'

/** Per-socket state */
interface SocketState {
  playerId: string
  roomId?: string
  turnInFlight?: boolean
}

/** All active game sessions keyed by roomId */
const sessions = new Map<string, GameSession>()

/** All sockets in a room, for broadcasting */
const roomSockets = new Map<string, Set<WebSocket>>()
const HEARTBEAT_INTERVAL_MS = 15_000

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

function isRuntimeHttpUnavailableMessage(code: unknown, status: unknown, message: string): boolean {
  const normalizedCode = typeof code === 'string' ? code.trim().toLowerCase().replace(/[\s-]+/gu, '_') : undefined
  if (
    normalizedCode === 'http_unavailable' ||
    normalizedCode === 'endpoint_not_found' ||
    normalizedCode === 'route_not_found'
  ) {
    return true
  }

  const normalized = message.replace(/\s+/gu, ' ').trim()
  if (!normalized || /\bmodel\b/iu.test(normalized)) {
    return false
  }

  return (
    /\bcannot (?:get|post|put|patch|delete)\b/iu.test(normalized) ||
    /\b(?:route|endpoint|path)\b.*\bnot found\b/iu.test(normalized) ||
    /\bserving the wrong endpoint\b/iu.test(normalized)
  )
}

export function formatWsError(err: unknown): string {
  const status = typeof err === 'object' && err !== null && 'status' in err ? (err as { status?: unknown }).status : undefined
  const code = typeof err === 'object' && err !== null && 'code' in err ? (err as { code?: unknown }).code : undefined
  const objectMessage =
    typeof err === 'object' && err !== null && 'message' in err && typeof (err as { message?: unknown }).message === 'string'
      ? (err as { message: string }).message
      : undefined
  const message =
    err instanceof Error ? err.message : typeof err === 'string' ? err : objectMessage ?? '服务器内部错误'

  if (code === 'cli_not_found') {
    return 'Optimus runtime 未就绪：缺少 .optimus\\dist\\runtime-cli.js，请先在当前仓库构建或初始化运行时。'
  }

  if (code === 'auth_failed') {
    return 'Optimus runtime 鉴权失败，请先执行 gh auth status / gh auth login，或检查所选引擎的登录状态。'
  }

  if (code === 'engine_not_available') {
    return 'Optimus runtime 引擎不可用，请确认对应 CLI 已安装并可执行。'
  }

  if (code === 'http_unavailable') {
    return 'Optimus runtime HTTP 服务不可用，请确认 http-runtime 已启动并监听正确端口。'
  }

  if (isRuntimeHttpUnavailableMessage(code, status, message)) {
    return 'Optimus runtime HTTP 服务不可用，请确认 http-runtime 已启动并监听正确端口。'
  }

  if (code === 'workspace_not_initialized') {
    return 'Optimus runtime 工作区未初始化，请确认仓库根目录存在 .optimus 配置。'
  }

  if (code === 'blocked_manual_intervention') {
    return 'Optimus runtime 需要人工介入后才能继续，请查看服务端日志中的 action_required。'
  }

  if (code === 'timeout') {
    return 'Optimus runtime 响应超时，请稍后重试或检查运行时状态。'
  }

  if (code === 'invalid_json' || code === 'empty_response' || code === 'process_error') {
    return 'Optimus runtime 返回了无效结果，请查看服务端日志获取详细信息。'
  }

  if (status === 404 && /model/i.test(message)) {
    return 'LLM 模型不可用，请检查 LLM_MODEL 配置。'
  }

  if (status === 404) {
    return 'LLM 服务返回 404，请检查 OPENAI_BASE_URL 或供应商兼容接口路径配置。'
  }

  if (status === 429 || /429|rate limit|too many requests|quota/i.test(message)) {
    return 'LLM 服务当前限流（429），请稍后重试。'
  }

  if (
    status === 401 ||
    status === 403 ||
    /api key|authentication|unauthorized|forbidden|incorrect api key|missing credentials/i.test(message)
  ) {
    if (/missing credentials|api key/i.test(message)) {
      return 'LLM 未配置：缺少 OPENAI_API_KEY。'
    }
    return 'LLM 服务鉴权失败，请检查 OPENAI_API_KEY。'
  }

  if (
    /玩家状态已失效|当前房间没有可响应的 NPC|LLM 未返回任何内容/i.test(message)
  ) {
    return message
  }

  if (/Optimus runtime|runtime-cli|workspace_not_initialized|runTurn/i.test(message)) {
    return `Optimus runtime 调用失败：${message}`
  }

  if (err instanceof Error && message && message !== '服务器内部错误') {
    return `${code ? '运行时' : 'NPC'} 调用失败：${message}`
  }

  return '服务器内部错误'
}

function createSystemPayload(content: string, prefix = 'system') {
  const message = createSystemMessage(content, prefix)
  return toSystemPayload(message)
}

function createSystemMessage(content: string, prefix = 'system'): Message {
  return {
    ...createMessageMetadata(prefix),
    senderId: 'system',
    senderName: '系统',
    content,
    type: 'system',
  }
}

function createErrorPayload(message: string, prefix = 'error') {
  return {
    ...createMessageMetadata(prefix),
    message,
  }
}

function getRuntimeMode(backend: 'agent-runtime' | 'llm'): 'sync' | undefined {
  return backend === 'agent-runtime' ? 'sync' : undefined
}

function toSystemPayload(message: Message) {
  return {
    id: message.id,
    timestamp: message.timestamp,
    content: message.content,
  }
}

function appendSystemMessage(
  roomId: string,
  content: string,
  roomManager: RoomManager,
  session?: GameSession,
  prefix = 'system',
) {
  const message = createSystemMessage(content, prefix)

  if (session) {
    session.recordSystemMessage(message)
    roomManager.syncRoomMessages(roomId, session.getMessages())
  } else {
    roomManager.syncRoomMessages(roomId, [...roomManager.getRoomMessages(roomId), message])
  }

  return toSystemPayload(message)
}

export function registerWsHandler(
  app: FastifyInstance,
  roomManager: RoomManager,
  runtime: {
    llmClient: LlmClient
    npcBackend: 'agent-runtime' | 'llm'
    runtimeAdapter: NpcTurnAdapter
  },
) {
  app.register(async (fastify) => {
    fastify.get('/ws', { websocket: true }, (socket: WebSocket, _request) => {
      const state: SocketState = {
        playerId: `player-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      }
      const heartbeatTimer = setInterval(() => {
        if (socket.readyState === socket.OPEN) {
          socket.ping()
        }
        send(socket, 'heartbeat', { timestamp: Date.now() })
      }, HEARTBEAT_INTERVAL_MS)

      send(socket, 'connected', { message: '欢迎来到戏精日记！' })

      socket.on('message', (rawMessage: Buffer | ArrayBuffer | Buffer[]) => {
        let data: Record<string, unknown>
        try {
          data = JSON.parse(rawMessage.toString())
        } catch {
          send(socket, 'error', createErrorPayload('消息格式无效'))
          return
        }
        handleMessage(socket, state, data, roomManager, runtime).catch((err) => {
          console.error('WS handler error:', err)
          send(socket, 'error', createErrorPayload(formatWsError(err)))
        })
      })

      socket.on('close', () => {
        clearInterval(heartbeatTimer)
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
              broadcast(
                state.roomId,
                'system',
                appendSystemMessage(state.roomId, `${player.name} 离开了房间。`, roomManager, session),
              )
            }
          }
          roomManager.persistRoom(state.roomId)
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
  runtime: {
    llmClient: LlmClient
    npcBackend: 'agent-runtime' | 'llm'
    runtimeAdapter: NpcTurnAdapter
  },
) {
  const { type } = data

  switch (type) {
    case 'join_room': {
      const roomId = data.roomId as string
      const playerName = data.playerName as string
      const characterId = data.characterId as string

      if (!roomId || !playerName || !characterId) {
        send(socket, 'error', createErrorPayload('缺少 roomId、playerName 或 characterId'))
        return
      }

      const room = roomManager.getRoom(roomId)
      if (!room) {
        send(socket, 'error', createErrorPayload('房间不存在'))
        return
      }
      const roomNpcBackend = room.npcBackend ?? runtime.npcBackend

      // Create session if first player joining
      let session = sessions.get(roomId)
      if (!session) {
        const game = roomManager.getRoomGame(roomId)
        if (!game) {
          send(socket, 'error', createErrorPayload('游戏模板不存在'))
          return
        }
        session = new GameSession(roomId, game.config, game.characters, game.worldMd, runtime.llmClient, {
          npcBackend: roomNpcBackend,
          runtimeAdapter: runtime.runtimeAdapter,
          initialMessages: roomManager.getRoomMessages(roomId),
        })
        sessions.set(roomId, session)
      }

      // Assign character
      const char = session.assignCharacter(state.playerId, playerName, characterId)
      if (!char) {
        send(socket, 'error', createErrorPayload('该角色当前不可选'))
        return
      }

      state.roomId = roomId
      room.addPlayer(playerName)
      room.start()
      roomManager.persistRoom(roomId)

      // Track socket in room
      if (!roomSockets.has(roomId)) roomSockets.set(roomId, new Set())
      roomSockets.get(roomId)!.add(socket)

      const joinedMessage = createSystemPayload(`你已作为 ${char.name} 加入房间。`, 'join')
      send(socket, 'room_joined', {
        roomId,
        characterName: char.name,
        characters: session.characters.map((c) => ({
          id: c.id,
          name: c.name,
          description: c.description,
          isNpc: c.isNpc,
        })),
        joinedMessage,
      })

      broadcast(
        roomId,
        'system',
        appendSystemMessage(roomId, `${playerName} 以 ${char.name} 的身份加入了房间。`, roomManager, session),
        socket,
      )
      break
    }

    case 'player_message': {
      const content = data.content as string
      if (!content || !state.roomId) {
        send(socket, 'error', createErrorPayload('你尚未加入房间，或消息为空'))
        return
      }

      if (state.turnInFlight) {
        send(socket, 'error', createErrorPayload('请等待当前 NPC 回复完成后再发送下一条消息'))
        return
      }

      const roomId = state.roomId
      const room = roomManager.getRoom(roomId)
      if (!room) {
        send(socket, 'error', createErrorPayload('房间不存在'))
        return
      }
      const session = sessions.get(roomId)
      if (!session) {
        send(socket, 'error', createErrorPayload('房间会话不存在，请重新加入房间'))
        return
      }

      const player = session.getPlayer(state.playerId)
      if (!player) {
        send(socket, 'error', createErrorPayload('玩家状态已失效，请重新加入房间'))
        return
      }

      const playerMessageMeta = createMessageMetadata(`player-${player.characterId}`)
      const turnMeta = createMessageMetadata('turn')
      const npcBackend = room.npcBackend ?? runtime.npcBackend
      const runtimeMode = getRuntimeMode(npcBackend)

      broadcast(roomId, 'player_msg', {
        id: playerMessageMeta.id,
        senderId: player.characterId,
        senderName: player.characterName,
        content,
        timestamp: playerMessageMeta.timestamp,
      })
      broadcast(roomId, 'npc_turn_start', {
        turnId: turnMeta.id,
        timestamp: turnMeta.timestamp,
        playerMessageId: playerMessageMeta.id,
        backend: npcBackend,
        runtimeMode,
        status: 'thinking',
      })

      let responseCount = 0
      let turnStatus: 'completed' | 'error' = 'completed'
      let turnErrorMessage: string | undefined
      state.turnInFlight = true
      try {
        const result = await session.handlePlayerMessage(
          state.playerId,
          content,
          (message, chunk) => {
            broadcast(roomId, 'npc_chunk', {
              turnId: turnMeta.id,
              id: message.id,
              npcId: message.senderId,
              npcName: message.senderName,
              chunk,
              timestamp: message.timestamp,
            })
          },
          (message) => {
            broadcast(roomId, 'npc_done', {
              turnId: turnMeta.id,
              id: message.id,
              npcId: message.senderId,
              npcName: message.senderName,
              content: message.content,
              timestamp: message.timestamp,
            })
          },
          {
            playerMessageId: playerMessageMeta.id,
            playerMessageTimestamp: playerMessageMeta.timestamp,
            npcBackend,
          },
        )
        responseCount = result.responseCount
        if (responseCount === 0) {
          broadcast(roomId, 'system', appendSystemMessage(roomId, '本轮暂无角色回应。', roomManager, session, 'no-response'))
        }
      } catch (err) {
        console.error('WS npc response error:', err)
        turnStatus = 'error'
        turnErrorMessage = formatWsError(err)
        appendSystemMessage(roomId, `错误：${turnErrorMessage}`, roomManager, session, 'npc-error')
        broadcast(roomId, 'npc_error', {
          ...createErrorPayload(turnErrorMessage, 'npc-error'),
          turnId: turnMeta.id,
        })
      } finally {
        state.turnInFlight = false
      }

      broadcast(roomId, 'npc_turn_end', {
        turnId: turnMeta.id,
        timestamp: Date.now(),
        playerMessageId: playerMessageMeta.id,
        responseCount,
        backend: npcBackend,
        runtimeMode,
        status: turnStatus,
        errorMessage: turnErrorMessage,
      })
      roomManager.syncRoomMessages(roomId, session.getMessages())
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
            broadcast(
              state.roomId,
              'system',
              appendSystemMessage(state.roomId, `${player.name} 离开了房间。`, roomManager, session),
            )
          }
        }
        roomManager.persistRoom(state.roomId)
        state.roomId = undefined
      }
      send(socket, 'system', createSystemPayload('你已离开房间。', 'leave'))
      break
    }

    default:
      send(socket, 'error', createErrorPayload(`未知消息类型：${type}`))
  }
}

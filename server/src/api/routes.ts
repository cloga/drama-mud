import type { FastifyInstance } from 'fastify'
import { RoomManager } from '../rooms/room-manager.js'
import { loadGameTemplates, type GameTemplate } from './game-loader.js'
import {
  createBuiltInRoomGame,
  createCustomRoomGame,
  createRoomRequestSchema,
} from '../rooms/room-game.js'
import type { Room } from '../rooms/room.js'
import {
  ACCESS_CODE_ERROR_MESSAGE,
  isAccessCodeAuthorized,
  resolveHeaderAccessCode,
  type AccessCodeAuthConfig,
} from '../auth/access-code.js'

let cachedTemplates: GameTemplate[] | null = null

async function getTemplates(): Promise<GameTemplate[]> {
  if (!cachedTemplates) {
    cachedTemplates = await loadGameTemplates()
  }
  return cachedTemplates
}

function readBodyAccessCode(body: unknown) {
  if (!body || typeof body !== 'object' || !('accessCode' in body)) {
    return ''
  }

  return typeof body.accessCode === 'string' ? body.accessCode.trim() : ''
}

export function registerRoutes(
  app: FastifyInstance,
  roomManager: RoomManager,
  auth: AccessCodeAuthConfig = { authEnabled: false, accessCode: '' },
) {
  app.post('/api/auth/access', async (request, reply) => {
    if (!auth.authEnabled) {
      return { ok: true, authEnabled: false }
    }

    if (!isAccessCodeAuthorized(readBodyAccessCode(request.body), auth)) {
      reply.status(401)
      return { error: ACCESS_CODE_ERROR_MESSAGE }
    }

    return { ok: true, authEnabled: true }
  })

  app.addHook('onRequest', async (request, reply) => {
    if (!auth.authEnabled) {
      return
    }

    const requestUrl = request.raw.url ?? request.url
    if (requestUrl.startsWith('/api/auth/access') || requestUrl.startsWith('/ws')) {
      return
    }

    if (!isAccessCodeAuthorized(resolveHeaderAccessCode(request.headers), auth)) {
      reply.status(401)
      return reply.send({ error: ACCESS_CODE_ERROR_MESSAGE })
    }
  })

  /** List available game templates */
  app.get('/api/games', async () => {
    const templates = await getTemplates()
    return {
      games: templates.map((t) => ({
        ...t.config,
        characters: t.characters,
      })),
    }
  })

  /** Get a single game template by name */
  app.get<{ Params: { name: string } }>('/api/games/:name', async (request, reply) => {
    const template = (await getTemplates()).find((t) => t.config.name === request.params.name)
    if (!template) {
      reply.status(404)
      return { error: '游戏模板不存在' }
    }
    return {
      ...template.config,
      characters: template.characters,
      worldMd: template.worldMd,
    }
  })

  /** List active rooms */
  app.get('/api/rooms', async () => {
    return { rooms: roomManager.listRooms() }
  })

  /** Create a new room */
  app.post('/api/rooms', async (request, reply) => {
    const result = createRoomRequestSchema.safeParse(request.body)
    if (!result.success) {
      reply.status(400)
      return {
        error: '请求参数无效',
        details: {
          ...result.error.flatten(),
          issues: result.error.issues,
        },
      }
    }

    let game
    if (result.data.customGame) {
      game = createCustomRoomGame(result.data.customGame)
    } else {
      const template = (await getTemplates()).find((item) => item.config.name === result.data.gameTemplate)
      if (!template) {
        reply.status(400)
        return { error: '游戏模板不存在' }
      }
      game = createBuiltInRoomGame(template)
    }

    const room = roomManager.createRoom(game, result.data.hostName, result.data.npcBackend)
    reply.status(201)
    return { room }
  })

  /** Get room details */
  app.get<{ Params: { roomId: string } }>('/api/rooms/:roomId', async (request) => {
    const room = roomManager.getRoom(request.params.roomId)
    if (!room) {
      return { error: '房间不存在' }
    }
    return { room }
  })

  /** Get effective game detail for a room */
  app.get<{ Params: { roomId: string } }>('/api/rooms/:roomId/game', async (request, reply) => {
    const room = roomManager.getRoom(request.params.roomId)
    if (!room) {
      reply.status(404)
      return { error: '房间不存在' }
    }

    return room.getGameDetail()
  })

  /** Get persisted chat history for a room */
  app.get<{ Params: { roomId: string } }>('/api/rooms/:roomId/messages', async (request, reply) => {
    const room = roomManager.getRoom(request.params.roomId)
    if (!room) {
      reply.status(404)
      return { error: '房间不存在' }
    }

    return {
      roomId: room.id,
      messages: toTranscriptMessages(room),
    }
  })
}

function toTranscriptMessages(room: Room) {
  const npcIds = new Set(room.getGame().characters.filter((character) => character.isNpc).map((character) => character.id))

  return room.getMessages().map((message) => ({
    id: message.id,
    senderName: message.senderName,
    content: message.content,
    timestamp: message.timestamp,
    type: message.type === 'system' ? 'system' : npcIds.has(message.senderId) ? 'npc' : 'player',
  }))
}

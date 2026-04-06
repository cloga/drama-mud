import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { RoomManager } from '../rooms/room-manager.js'
import { loadGameTemplates, type GameTemplate } from './game-loader.js'

let cachedTemplates: GameTemplate[] | null = null

export function registerRoutes(app: FastifyInstance, roomManager: RoomManager) {
  /** List available game templates */
  app.get('/api/games', async () => {
    if (!cachedTemplates) {
      cachedTemplates = await loadGameTemplates()
    }
    return {
      games: cachedTemplates.map((t) => ({
        ...t.config,
        characters: t.characters,
      })),
    }
  })

  /** Get a single game template by name */
  app.get<{ Params: { name: string } }>('/api/games/:name', async (request, reply) => {
    if (!cachedTemplates) {
      cachedTemplates = await loadGameTemplates()
    }
    const template = cachedTemplates.find((t) => t.config.name === request.params.name)
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
    const schema = z.object({
      gameTemplate: z.string(),
      hostName: z.string(),
    })

    const body = schema.parse(request.body)
    const room = roomManager.createRoom(body.gameTemplate, body.hostName)
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
}

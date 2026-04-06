import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { registerRoutes } from '../api/routes.js'
import { RoomManager } from '../rooms/room-manager.js'
import { RoomStore } from '../rooms/room-store.js'

describe('room routes', () => {
  let app: FastifyInstance
  let roomManager: RoomManager
  let tempDir: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'drama-mud-routes-'))
    roomManager = new RoomManager(new RoomStore(join(tempDir, 'rooms.json')))
    app = Fastify()
    registerRoutes(app, roomManager)
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
    roomManager.close()
    await rm(tempDir, { recursive: true, force: true })
  })

  it('creates a room from a built-in template and exposes its effective game detail', async () => {
    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/rooms',
      payload: {
        hostName: 'Host',
        gameTemplate: 'power-trip-fixed',
      },
    })

    expect(createResponse.statusCode).toBe(201)

    const createBody = createResponse.json()
    expect(createBody.room.gameTemplate).toBe('power-trip-fixed')
    expect(createBody.room.gameSource).toBe('built-in')
    expect(createBody.room.npcBackend).toBe('llm')

    const detailResponse = await app.inject({
      method: 'GET',
      url: `/api/rooms/${createBody.room.id}/game`,
    })

    expect(detailResponse.statusCode).toBe(200)

    const detailBody = detailResponse.json()
    expect(detailBody.source).toBe('built-in')
    expect(detailBody.name).toBe('power-trip-fixed')
    expect(detailBody.characters.length).toBeGreaterThan(0)
    expect(typeof detailBody.worldMd).toBe('string')
  })

  it('creates a room from custom authored content and exposes its effective game detail', async () => {
    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/rooms',
      payload: {
        hostName: 'Author',
        customGame: {
          title: '自定义宫斗',
          description: '玩家自定义的宫廷故事',
          worldMd: '# 背景\n这里是玩家定义的世界。',
          characters: [
            {
              id: 'hero',
              name: '主角',
              description: '命运多舛的主角',
              personality: '坚韧、机敏',
              isNpc: false,
            },
            {
              id: 'advisor',
              name: '谋士',
              description: '辅佐主角的军师',
              personality: '冷静、缜密',
              isNpc: true,
            },
          ],
        },
      },
    })

    expect(createResponse.statusCode).toBe(201)

    const createBody = createResponse.json()
    expect(createBody.room.gameSource).toBe('custom')
    expect(createBody.room.gameTemplate).toMatch(/^custom-/)

    const detailResponse = await app.inject({
      method: 'GET',
      url: `/api/rooms/${createBody.room.id}/game`,
    })

    expect(detailResponse.statusCode).toBe(200)

    const detailBody = detailResponse.json()
    expect(detailBody.source).toBe('custom')
    expect(detailBody.config.displayName).toBe('自定义宫斗')
    expect(detailBody.displayName).toBe('自定义宫斗')
    expect(detailBody.roleMode).toBe('open')
    expect(detailBody.type).toBe('power-trip')
    expect(detailBody.worldMd).toContain('玩家定义的世界')
    expect(detailBody.characters).toHaveLength(2)
  })

  it('keeps an llm-backed room when npcBackend is provided', async () => {
    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/rooms',
      payload: {
        hostName: 'Host',
        gameTemplate: 'power-trip-fixed',
        npcBackend: 'llm',
      },
    })

    expect(createResponse.statusCode).toBe(201)
    expect(createResponse.json().room.npcBackend).toBe('llm')

    const roomResponse = await app.inject({
      method: 'GET',
      url: `/api/rooms/${createResponse.json().room.id}`,
    })

    expect(roomResponse.json().room.npcBackend).toBe('llm')
  })

  it('rejects invalid room creation payloads with zod validation details', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/rooms',
      payload: {
        hostName: 'Broken',
        gameTemplate: 'power-trip-fixed',
        customGame: {
          title: '重复角色',
          description: '无效 payload',
          worldMd: '',
          characters: [
            {
              id: 'dup',
              name: '甲',
              description: '描述',
              personality: '个性',
              isNpc: false,
            },
            {
              id: 'dup',
              name: '乙',
              description: '描述',
              personality: '个性',
              isNpc: true,
            },
          ],
        },
      },
    })

    expect(response.statusCode).toBe(400)

    const body = response.json()
    expect(body.error).toBe('请求参数无效')
    expect(body.details.fieldErrors.gameTemplate).toContain('必须且只能提供 gameTemplate 或 customGame 其中之一')
    expect(body.details.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: '必须且只能提供 gameTemplate 或 customGame 其中之一',
        }),
      ]),
    )
  })

  it('rejects custom games without both a playable character and an npc', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/rooms',
      payload: {
        hostName: 'Broken',
        customGame: {
          title: '只有玩家',
          description: '缺少 NPC',
          worldMd: '# 世界',
          characters: [
            {
              id: 'hero',
              name: '主角',
              description: '描述',
              personality: '个性',
              isNpc: false,
            },
          ],
        },
      },
    })

    expect(response.statusCode).toBe(400)

    const body = response.json()
    expect(body.error).toBe('请求参数无效')
    expect(body.details.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: '自定义故事至少需要一个 NPC',
        }),
      ]),
    )
  })

  it('returns persisted room transcript messages', async () => {
    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/rooms',
      payload: {
        hostName: 'Host',
        gameTemplate: 'power-trip-fixed',
      },
    })

    const roomId = createResponse.json().room.id as string

    roomManager.syncRoomMessages(roomId, [
      {
        id: 'm-player',
        senderId: 'player-hero',
        senderName: '剑无痕',
        content: '昨晚的线索你怎么看？',
        timestamp: 1,
        type: 'dialog',
      },
      {
        id: 'm-npc',
        senderId: 'npc-innkeeper',
        senderName: '陈老板',
        content: '先别急，坐下慢慢说。',
        timestamp: 2,
        type: 'dialog',
      },
      {
        id: 'm-system',
        senderId: 'system',
        senderName: '系统',
        content: '本轮暂无角色回应。',
        timestamp: 3,
        type: 'system',
      },
    ])

    const response = await app.inject({
      method: 'GET',
      url: `/api/rooms/${roomId}/messages`,
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      roomId,
      messages: [
        {
          id: 'm-player',
          senderName: '剑无痕',
          content: '昨晚的线索你怎么看？',
          timestamp: 1,
          type: 'player',
        },
        {
          id: 'm-npc',
          senderName: '陈老板',
          content: '先别急，坐下慢慢说。',
          timestamp: 2,
          type: 'npc',
        },
        {
          id: 'm-system',
          senderName: '系统',
          content: '本轮暂无角色回应。',
          timestamp: 3,
          type: 'system',
        },
      ],
    })
  })
})

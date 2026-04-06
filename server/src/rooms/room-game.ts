import type { CharacterConfig, GameConfig } from '@drama-mud/engine'
import { z } from 'zod'
import type { GameTemplate } from '../api/game-loader.js'

export const npcBackendSchema = z.enum(['agent-runtime', 'llm'])
export type NpcBackend = z.infer<typeof npcBackendSchema>

export const characterConfigSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    description: z.string().min(1),
    personality: z.string().min(1),
    isNpc: z.boolean(),
  })
  .strict()

export const customGameSchema = z
  .object({
    title: z.string().min(1),
    description: z.string().min(1),
    worldMd: z.string().min(1),
    characters: z.array(characterConfigSchema).min(2),
  })
  .strict()
  .superRefine((game, ctx) => {
    const seenIds = new Set<string>()
    let playableCount = 0
    let npcCount = 0

    for (const [index, character] of game.characters.entries()) {
      if (seenIds.has(character.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: '角色 id 不能重复',
          path: ['characters', index, 'id'],
        })
        continue
      }
      seenIds.add(character.id)

      if (character.isNpc) {
        npcCount += 1
      } else {
        playableCount += 1
      }
    }

    if (playableCount < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '自定义故事至少需要一个可选玩家角色',
        path: ['characters'],
      })
    }

    if (npcCount < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '自定义故事至少需要一个 NPC',
        path: ['characters'],
      })
    }
  })

export const createRoomRequestSchema = z
  .object({
    hostName: z.string().min(1),
    npcBackend: npcBackendSchema.optional(),
    gameTemplate: z.string().min(1).optional(),
    customGame: customGameSchema.optional(),
  })
  .strict()
  .superRefine((body, ctx) => {
    const provided = Number(Boolean(body.gameTemplate)) + Number(Boolean(body.customGame))
    if (provided !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '必须且只能提供 gameTemplate 或 customGame 其中之一',
        path: ['gameTemplate'],
      })
    }
  })

export type CustomGameInput = z.infer<typeof customGameSchema>
export type CreateRoomRequest = z.infer<typeof createRoomRequestSchema>

export interface RoomGameData {
  source: 'built-in' | 'custom'
  config: GameConfig
  characters: CharacterConfig[]
  worldMd: string
}

export interface RoomGameDetail {
  source: RoomGameData['source']
  config: GameConfig
  characters: CharacterConfig[]
  worldMd: string
  name: string
  displayName: string
  type: GameConfig['type']
  roleMode: GameConfig['roleMode']
  description: string
}

export function createBuiltInRoomGame(template: GameTemplate): RoomGameData {
  return structuredClone({
    source: 'built-in' as const,
    config: template.config,
    characters: template.characters,
    worldMd: template.worldMd,
  })
}

export function createCustomRoomGame(customGame: CustomGameInput): RoomGameData {
  const config: GameConfig = {
    name: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    displayName: customGame.title,
    type: 'power-trip',
    roleMode: 'open',
    description: customGame.description,
  }

  return {
    source: 'custom',
    config,
    characters: structuredClone(customGame.characters),
    worldMd: customGame.worldMd,
  }
}

export function toRoomGameDetail(game: RoomGameData): RoomGameDetail {
  return {
    source: game.source,
    config: structuredClone(game.config),
    ...game.config,
    characters: structuredClone(game.characters),
    worldMd: game.worldMd,
  }
}

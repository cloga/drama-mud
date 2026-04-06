const API_BASE = import.meta.env.VITE_API_URL ?? ''

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly statusText: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export interface CharacterInfo {
  id: string
  name: string
  description: string
  personality: string
  isNpc: boolean
}

export interface CustomCharacterDraft {
  name: string
  description: string
  personality: string
}

export interface CustomGameDraft {
  title: string
  description: string
  worldMd: string
  playableCharacters: CustomCharacterDraft[]
  npcCharacters: CustomCharacterDraft[]
}

export interface CustomGameInput {
  title: string
  description: string
  worldMd: string
  characters: CharacterInfo[]
}

export interface GameInfo {
  name: string
  displayName: string
  type: string
  roleMode: string
  description: string
  characters: CharacterInfo[]
}

export interface GameDetail extends GameInfo {
  worldMd: string
}

export interface RoomInfo {
  id: string
  gameTemplate: string
  gameDisplayName?: string
  mode?: 'template' | 'custom'
  npcBackend?: 'agent-runtime' | 'llm'
  hostName: string
  status: string
  players: string[]
  createdAt: number
}

export interface RoomTranscriptMessage {
  id: string
  senderName: string
  content: string
  timestamp: number
  type: 'player' | 'npc' | 'system'
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null
    throw new ApiError(
      body?.error ?? `请求失败：${response.status} ${response.statusText}`,
      response.status,
      response.statusText,
    )
  }

  return response.json() as Promise<T>
}

function createCustomCharacterId(name: string, index: number, isNpc: boolean) {
  const normalized = name
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')

  return normalized || `${isNpc ? 'npc' : 'player'}-${index + 1}`
}

function buildCustomCharacters(customGame: CustomGameDraft): CharacterInfo[] {
  return [
    ...customGame.playableCharacters.map((character, index) => ({
      id: createCustomCharacterId(character.name, index, false),
      ...character,
      isNpc: false,
    })),
    ...customGame.npcCharacters.map((character, index) => ({
      id: createCustomCharacterId(character.name, index, true),
      ...character,
      isNpc: true,
    })),
  ]
}

async function requestRoomGame(roomId: string) {
  try {
    return await request<GameDetail>(`/api/rooms/${roomId}/game`)
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 404) {
      throw error
    }
  }

  return request<GameDetail>(`/api/rooms/${roomId}/game-detail`)
}

export const api = {
  getGames: () => request<{ games: GameInfo[] }>('/api/games'),
  getGame: (name: string) => request<GameDetail>(`/api/games/${name}`),
  getRoomGameDetail: async (roomId: string, fallbackTemplateName?: string) => {
    try {
      return await requestRoomGame(roomId)
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 404 || !fallbackTemplateName) {
        throw error
      }

      return api.getGame(fallbackTemplateName)
    }
  },
  createRoom: (gameTemplate: string, hostName: string, npcBackend: 'agent-runtime' | 'llm' = 'llm') =>
    request<{ room: RoomInfo }>('/api/rooms', {
      method: 'POST',
      body: JSON.stringify({ gameTemplate, hostName, npcBackend }),
    }),
  createCustomRoom: (
    hostName: string,
    customGame: CustomGameDraft,
    npcBackend: 'agent-runtime' | 'llm' = 'llm',
  ) => {
    const payload: CustomGameInput = {
      title: customGame.title,
      description: customGame.description,
      worldMd: customGame.worldMd,
      characters: buildCustomCharacters(customGame),
    }

    return request<{ room: RoomInfo }>('/api/rooms', {
      method: 'POST',
      body: JSON.stringify({
        hostName,
        npcBackend,
        customGame: payload,
      }),
    })
  },
  getRoom: async (roomId: string) => {
    const response = await request<{ room?: RoomInfo; error?: string }>(`/api/rooms/${roomId}`)
    if (!response.room) {
      throw new Error(response.error ?? '房间不存在')
    }
    return { room: response.room }
  },
  getRoomMessages: (roomId: string) =>
    request<{ roomId: string; messages: RoomTranscriptMessage[] }>(`/api/rooms/${roomId}/messages`),
}

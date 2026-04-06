const API_BASE = import.meta.env.VITE_API_URL ?? ''

/** Character from a game template */
export interface CharacterInfo {
  id: string
  name: string
  description: string
  personality: string
  isNpc: boolean
}

/** Game template returned by GET /api/games */
export interface GameInfo {
  name: string
  displayName: string
  type: string
  roleMode: string
  description: string
  characters: CharacterInfo[]
}

/** Room returned by POST /api/rooms and GET /api/rooms/:id */
export interface RoomInfo {
  id: string
  gameTemplate: string
  hostName: string
  status: string
  players: string[]
  createdAt: number
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null
    throw new Error(body?.error ?? `请求失败：${response.status} ${response.statusText}`)
  }

  return response.json() as Promise<T>
}

export const api = {
  getGames: () => request<{ games: GameInfo[] }>('/api/games'),
  getGame: (name: string) => request<GameInfo & { worldMd: string }>(`/api/games/${name}`),
  createRoom: (gameTemplate: string, hostName: string) =>
    request<{ room: RoomInfo }>('/api/rooms', {
      method: 'POST',
      body: JSON.stringify({ gameTemplate, hostName }),
    }),
  getRoom: (roomId: string) => request<{ room: RoomInfo }>(`/api/rooms/${roomId}`),
}

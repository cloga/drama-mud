import type { RoomGameData } from './room-game.js'
import { toRoomGameDetail } from './room-game.js'
import type { Message } from '@drama-mud/engine'
import type { PersistedRoomRecord } from './room-store.js'
import type { NpcBackend } from './room-game.js'

export type RoomStatus = 'waiting' | 'playing' | 'ended'

/** Represents a single game room */
export class Room {
  #game: RoomGameData
  #messages: Message[]
  public status: RoomStatus = 'waiting'
  public players: string[] = []
  public createdAt: number = Date.now()
  public lastActivityAt: number = Date.now()
  public readonly gameTemplate: string
  public readonly gameSource: RoomGameData['source']
  public readonly npcBackend: NpcBackend

  constructor(
    public readonly id: string,
    game: RoomGameData,
    public readonly hostName: string,
    options?: {
      npcBackend?: NpcBackend
      status?: RoomStatus
      players?: string[]
      createdAt?: number
      lastActivityAt?: number
      messages?: Message[]
    },
  ) {
    this.#game = game
    this.#messages = [...(options?.messages ?? [])]
    this.gameTemplate = game.config.name
    this.gameSource = game.source
    this.npcBackend = options?.npcBackend ?? 'llm'
    this.status = options?.status ?? 'waiting'
    this.createdAt = options?.createdAt ?? Date.now()
    this.lastActivityAt = options?.lastActivityAt ?? this.createdAt
    this.players = options?.players?.length ? [...options.players] : [hostName]
  }

  getGame(): RoomGameData {
    return structuredClone(this.#game)
  }

  getGameDetail() {
    return toRoomGameDetail(this.getGame())
  }

  getMessages(): Message[] {
    return structuredClone(this.#messages)
  }

  replaceMessages(messages: Message[]): void {
    this.#messages = structuredClone(messages)
    this.lastActivityAt = Date.now()
  }

  addPlayer(playerName: string): boolean {
    if (this.status !== 'waiting') return false
    if (this.players.includes(playerName)) return false
    this.players.push(playerName)
    this.lastActivityAt = Date.now()
    return true
  }

  removePlayer(playerName: string): boolean {
    const index = this.players.indexOf(playerName)
    if (index === -1) return false
    this.players.splice(index, 1)
    this.lastActivityAt = Date.now()
    return true
  }

  start(): boolean {
    if (this.status !== 'waiting') return false
    this.status = 'playing'
    this.lastActivityAt = Date.now()
    return true
  }

  end(): void {
    this.status = 'ended'
    this.lastActivityAt = Date.now()
  }

  toRecord(): PersistedRoomRecord {
    return {
      id: this.id,
      hostName: this.hostName,
      status: this.status,
      players: [...this.players],
      createdAt: this.createdAt,
      lastActivityAt: this.lastActivityAt,
      npcBackend: this.npcBackend,
      game: this.getGame(),
      messages: this.getMessages(),
    }
  }
}

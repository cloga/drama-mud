import { Room } from './room.js'
import type { Message } from '@drama-mud/engine'
import type { RoomGameData } from './room-game.js'
import { RoomStore } from './room-store.js'
import type { NpcBackend } from './room-game.js'

/** Manages all active game rooms */
export class RoomManager {
  private rooms: Map<string, Room> = new Map()

  constructor(
    private readonly store = new RoomStore(),
    private readonly defaultNpcBackend: NpcBackend = 'llm',
  ) {
    for (const record of this.store.loadRooms()) {
      const room = new Room(record.id, record.game, record.hostName, {
        npcBackend: record.npcBackend ?? this.defaultNpcBackend,
        status: record.status,
        players: record.players,
        createdAt: record.createdAt,
        lastActivityAt: record.lastActivityAt,
        messages: record.messages,
      })
      this.rooms.set(room.id, room)
    }
  }

  createRoom(game: RoomGameData, hostName: string, npcBackend = this.defaultNpcBackend): Room {
    let id = `room-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    while (this.rooms.has(id)) {
      id = `room-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    }
    const room = new Room(id, game, hostName, { npcBackend })
    this.rooms.set(id, room)
    this.persist()
    return room
  }

  getRoom(id: string): Room | undefined {
    return this.rooms.get(id)
  }

  getRoomGame(id: string): RoomGameData | undefined {
    return this.rooms.get(id)?.getGame()
  }

  getRoomMessages(id: string): Message[] {
    return this.rooms.get(id)?.getMessages() ?? []
  }

  syncRoomMessages(id: string, messages: Message[]): boolean {
    const room = this.rooms.get(id)
    if (!room) {
      return false
    }

    room.replaceMessages(messages)
    this.persist()
    return true
  }

  listRooms(): Room[] {
    return Array.from(this.rooms.values())
  }

  persistRoom(id: string): boolean {
    if (!this.rooms.has(id)) {
      return false
    }

    this.persist()
    return true
  }

  removeRoom(id: string): boolean {
    const deleted = this.rooms.delete(id)
    if (deleted) {
      this.persist()
    }
    return deleted
  }

  close(): void {
    this.store.close()
  }

  private persist() {
    this.store.saveRooms(this.listRooms().map((room) => room.toRecord()))
  }
}

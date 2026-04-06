import { Room } from './room.js'

/** Manages all active game rooms */
export class RoomManager {
  private rooms: Map<string, Room> = new Map()

  createRoom(gameTemplate: string, hostName: string): Room {
    const id = `room-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const room = new Room(id, gameTemplate, hostName)
    this.rooms.set(id, room)
    return room
  }

  getRoom(id: string): Room | undefined {
    return this.rooms.get(id)
  }

  listRooms(): Room[] {
    return Array.from(this.rooms.values())
  }

  removeRoom(id: string): boolean {
    return this.rooms.delete(id)
  }
}

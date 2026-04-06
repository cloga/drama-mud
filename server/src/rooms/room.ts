export type RoomStatus = 'waiting' | 'playing' | 'ended'

/** Represents a single game room */
export class Room {
  public status: RoomStatus = 'waiting'
  public players: string[] = []
  public createdAt: number = Date.now()

  constructor(
    public readonly id: string,
    public readonly gameTemplate: string,
    public readonly hostName: string,
  ) {
    this.players.push(hostName)
  }

  addPlayer(playerName: string): boolean {
    if (this.status !== 'waiting') return false
    if (this.players.includes(playerName)) return false
    this.players.push(playerName)
    return true
  }

  removePlayer(playerName: string): boolean {
    const index = this.players.indexOf(playerName)
    if (index === -1) return false
    this.players.splice(index, 1)
    return true
  }

  start(): boolean {
    if (this.status !== 'waiting') return false
    this.status = 'playing'
    return true
  }

  end(): void {
    this.status = 'ended'
  }
}

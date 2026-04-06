import type { Message } from '@drama-mud/engine'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { NpcBackend, RoomGameData } from './room-game.js'
import type { RoomStatus } from './room.js'

const serverRoot = fileURLToPath(new URL('../..', import.meta.url))
const DEFAULT_ROOM_STORE_PATH = resolve(serverRoot, '.runtime-data', 'rooms.json')
const DEFAULT_FLUSH_DELAY_MS = 50

export interface PersistedRoomRecord {
  id: string
  hostName: string
  status: RoomStatus
  players: string[]
  createdAt: number
  lastActivityAt: number
  npcBackend: NpcBackend
  game: RoomGameData
  messages: Message[]
}

interface RoomStoreOptions {
  flushDelayMs?: number
}

export class RoomStore {
  private pendingRecords?: PersistedRoomRecord[]
  private flushTimer?: NodeJS.Timeout
  private closed = false

  private static readonly activeStores = new Set<RoomStore>()
  private static processHandlersRegistered = false

  constructor(
    private readonly filePath = DEFAULT_ROOM_STORE_PATH,
    private readonly options: RoomStoreOptions = {},
  ) {
    RoomStore.activeStores.add(this)
    RoomStore.registerProcessHandlers()
  }

  loadRooms(): PersistedRoomRecord[] {
    if (!existsSync(this.filePath)) {
      return []
    }

    try {
      const parsed = JSON.parse(readFileSync(this.filePath, 'utf8')) as unknown
      if (!Array.isArray(parsed)) {
        return []
      }

      return parsed
        .map((record) => normalizeRoomRecord(record))
        .filter((record): record is PersistedRoomRecord => Boolean(record))
    } catch (error) {
      console.warn(`[room-store] Failed to read ${this.filePath}:`, error)
      return []
    }
  }

  saveRooms(records: PersistedRoomRecord[]): void {
    if (this.closed) {
      return
    }

    this.pendingRecords = structuredClone(records)
    if (this.flushTimer) {
      return
    }

    this.flushTimer = setTimeout(() => {
      this.flushTimer = undefined
      this.flushPending()
    }, this.options.flushDelayMs ?? DEFAULT_FLUSH_DELAY_MS)
    this.flushTimer.unref?.()
  }

  flushPending(): void {
    try {
      if (this.flushTimer) {
        clearTimeout(this.flushTimer)
        this.flushTimer = undefined
      }

      if (!this.pendingRecords) {
        return
      }

      const records = this.pendingRecords
      this.pendingRecords = undefined
      mkdirSync(dirname(this.filePath), { recursive: true })
      writeFileSync(this.filePath, JSON.stringify(records, null, 2), 'utf8')
    } catch (error) {
      console.warn(`[room-store] Failed to write ${this.filePath}:`, error)
    }
  }

  close(): void {
    if (this.closed) {
      return
    }

    this.flushPending()
    this.closed = true
    RoomStore.activeStores.delete(this)
  }

  private static flushAllPending() {
    for (const store of RoomStore.activeStores) {
      store.flushPending()
    }
  }

  private static registerProcessHandlers() {
    if (RoomStore.processHandlersRegistered) {
      return
    }

    RoomStore.processHandlersRegistered = true
    process.on('beforeExit', () => RoomStore.flushAllPending())
    process.on('exit', () => RoomStore.flushAllPending())
    process.once('SIGINT', () => {
      RoomStore.flushAllPending()
      process.exit(130)
    })
    process.once('SIGTERM', () => {
      RoomStore.flushAllPending()
      process.exit(143)
    })
  }
}

function normalizeRoomRecord(record: unknown): PersistedRoomRecord | null {
  if (!record || typeof record !== 'object') {
    return null
  }

  const candidate = record as Record<string, unknown>
  const id = typeof candidate.id === 'string' ? candidate.id.trim() : ''
  const hostName = typeof candidate.hostName === 'string' ? candidate.hostName.trim() : ''
  const status =
    candidate.status === 'waiting' || candidate.status === 'playing' || candidate.status === 'ended'
      ? candidate.status
      : 'waiting'
  const players = Array.isArray(candidate.players)
    ? candidate.players.filter((player): player is string => typeof player === 'string' && player.trim().length > 0)
    : []
  const createdAt =
    typeof candidate.createdAt === 'number' && Number.isFinite(candidate.createdAt) ? candidate.createdAt : Date.now()
  const lastActivityAt =
    typeof candidate.lastActivityAt === 'number' && Number.isFinite(candidate.lastActivityAt)
      ? candidate.lastActivityAt
      : createdAt
  const npcBackend = candidate.npcBackend === 'agent-runtime' ? 'agent-runtime' : 'llm'

  if (!id || !hostName || !candidate.game || typeof candidate.game !== 'object') {
    return null
  }

  return {
    id,
    hostName,
    status,
    players: players.length > 0 ? players : [hostName],
    createdAt,
    lastActivityAt,
    npcBackend,
    game: candidate.game as RoomGameData,
    messages: normalizeMessages(candidate.messages),
  }
}

function normalizeMessages(messages: unknown): Message[] {
  if (!Array.isArray(messages)) {
    return []
  }

  return messages
    .map((message) => normalizeMessage(message))
    .filter((message): message is Message => Boolean(message))
    .sort((left, right) => left.timestamp - right.timestamp)
}

function normalizeMessage(message: unknown): Message | null {
  if (!message || typeof message !== 'object') {
    return null
  }

  const candidate = message as Record<string, unknown>
  const id = typeof candidate.id === 'string' ? candidate.id.trim() : ''
  const senderId = typeof candidate.senderId === 'string' ? candidate.senderId.trim() : ''
  const senderName = typeof candidate.senderName === 'string' ? candidate.senderName.trim() : ''
  const content = typeof candidate.content === 'string' ? candidate.content : ''
  const timestamp =
    typeof candidate.timestamp === 'number' && Number.isFinite(candidate.timestamp)
      ? candidate.timestamp
      : Date.now()

  if (!id || !senderId || !senderName) {
    return null
  }

  const type =
    candidate.type === 'dialog' ||
    candidate.type === 'action' ||
    candidate.type === 'narration' ||
    candidate.type === 'system'
      ? candidate.type
      : 'dialog'

  return {
    id,
    senderId,
    senderName,
    content,
    timestamp,
    type,
  }
}

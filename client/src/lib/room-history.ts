const PLAYER_NAME_KEY = 'drama-mud:web-player-name'
const ROOM_HISTORY_KEY = 'drama-mud:web-room-history'
const MAX_RECENT_ROOMS = 6

export interface RoomHistoryEntry {
  roomId: string
  templateName: string
  templateDisplayName?: string
  npcBackend?: 'agent-runtime' | 'llm'
  playerName: string
  characterId?: string
  firstPlayedAt: number
  lastPlayedAt: number
  lastCharacterSelectedAt?: number
}

interface RoomHistoryDraft {
  roomId: string
  templateName: string
  templateDisplayName?: string
  npcBackend?: 'agent-runtime' | 'llm'
  playerName: string
  characterId?: string
}

function isBrowserReady() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function readStorage<T>(key: string): T | null {
  if (!isBrowserReady()) {
    return null
  }

  try {
    const value = window.localStorage.getItem(key)
    return value ? (JSON.parse(value) as T) : null
  } catch (error) {
    console.warn(`[storage] Failed to read ${key}:`, error)
    return null
  }
}

function writeStorage(key: string, value: unknown) {
  if (!isBrowserReady()) {
    return
  }

  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch (error) {
    console.warn(`[storage] Failed to write ${key}:`, error)
  }
}

function normalizeRoomHistoryEntry(entry: unknown): RoomHistoryEntry | null {
  if (!entry || typeof entry !== 'object') {
    return null
  }

  const candidate = entry as Record<string, unknown>
  const roomId = typeof candidate.roomId === 'string' ? candidate.roomId.trim() : ''
  const templateName = typeof candidate.templateName === 'string' ? candidate.templateName.trim() : ''
  const templateDisplayName =
    typeof candidate.templateDisplayName === 'string' && candidate.templateDisplayName.trim()
      ? candidate.templateDisplayName.trim()
      : undefined
  const playerName = typeof candidate.playerName === 'string' ? candidate.playerName.trim() : ''
  const npcBackend =
    candidate.npcBackend === 'agent-runtime' || candidate.npcBackend === 'llm' ? candidate.npcBackend : undefined

  if (!roomId || !templateName || !playerName) {
    return null
  }

  const firstPlayedAt =
    typeof candidate.firstPlayedAt === 'number' && Number.isFinite(candidate.firstPlayedAt)
      ? candidate.firstPlayedAt
      : Date.now()
  const lastPlayedAt =
    typeof candidate.lastPlayedAt === 'number' && Number.isFinite(candidate.lastPlayedAt)
      ? candidate.lastPlayedAt
      : firstPlayedAt
  const characterId =
    typeof candidate.characterId === 'string' && candidate.characterId.trim() ? candidate.characterId : undefined
  const lastCharacterSelectedAt =
    typeof candidate.lastCharacterSelectedAt === 'number' && Number.isFinite(candidate.lastCharacterSelectedAt)
      ? candidate.lastCharacterSelectedAt
      : undefined

  return {
    roomId,
    templateName,
    templateDisplayName,
    ...(npcBackend ? { npcBackend } : {}),
    playerName,
    characterId,
    firstPlayedAt,
    lastPlayedAt,
    lastCharacterSelectedAt,
  }
}

function writeRoomHistory(entries: RoomHistoryEntry[]) {
  writeStorage(
    ROOM_HISTORY_KEY,
    [...entries]
      .sort((left, right) => right.lastPlayedAt - left.lastPlayedAt)
      .slice(0, MAX_RECENT_ROOMS),
  )
}

export function getStoredPlayerName() {
  return readStorage<string>(PLAYER_NAME_KEY) ?? ''
}

export function setStoredPlayerName(playerName: string) {
  if (!isBrowserReady()) {
    return
  }

  const value = playerName.trim()
  if (!value) {
    window.localStorage.removeItem(PLAYER_NAME_KEY)
    return
  }

  writeStorage(PLAYER_NAME_KEY, value)
}

export function getRoomHistory() {
  const entries = readStorage<unknown[]>(ROOM_HISTORY_KEY)
  if (!Array.isArray(entries)) {
    return []
  }

  const normalized = entries
    .map((entry) => normalizeRoomHistoryEntry(entry))
    .filter((entry): entry is RoomHistoryEntry => Boolean(entry))
    .sort((left, right) => right.lastPlayedAt - left.lastPlayedAt)
    .slice(0, MAX_RECENT_ROOMS)

  if (normalized.length !== entries.length) {
    writeRoomHistory(normalized)
  }

  return normalized
}

export function upsertRoomHistory(entry: RoomHistoryDraft) {
  const roomId = entry.roomId.trim()
  const templateName = entry.templateName.trim()
  const templateDisplayName = entry.templateDisplayName?.trim()
  const npcBackend = entry.npcBackend
  const playerName = entry.playerName.trim()
  const characterId = entry.characterId?.trim()

  if (!roomId || !templateName || !playerName) {
    return getRoomHistory()
  }

  const now = Date.now()
  const existing = getRoomHistory().find((item) => item.roomId === roomId)
  const nextEntries = [
    {
        roomId,
        templateName,
        ...(templateDisplayName
          ? {
              templateDisplayName,
            }
          : existing?.templateDisplayName
            ? {
                templateDisplayName: existing.templateDisplayName,
              }
            : {}),
        ...(npcBackend
          ? {
              npcBackend,
            }
          : existing?.npcBackend
            ? {
                npcBackend: existing.npcBackend,
              }
            : {}),
        playerName,
        firstPlayedAt: existing?.firstPlayedAt ?? now,
        lastPlayedAt: now,
      ...(characterId
        ? {
            characterId,
            lastCharacterSelectedAt: now,
          }
        : existing?.characterId
          ? {
              characterId: existing.characterId,
              lastCharacterSelectedAt: existing.lastCharacterSelectedAt,
            }
          : {}),
    },
    ...getRoomHistory().filter((item) => item.roomId !== roomId),
  ]

  writeRoomHistory(nextEntries)
  return getRoomHistory()
}

export function clearRoomHistoryCharacter(roomId: string) {
  const nextEntries = getRoomHistory().map((entry) =>
    entry.roomId === roomId
      ? {
          ...entry,
          characterId: undefined,
          lastCharacterSelectedAt: undefined,
          lastPlayedAt: Date.now(),
        }
      : entry,
  )

  writeRoomHistory(nextEntries)
  return getRoomHistory()
}

export function removeRoomHistory(roomId: string) {
  const nextEntries = getRoomHistory().filter((entry) => entry.roomId !== roomId)
  writeRoomHistory(nextEntries)
  return nextEntries
}

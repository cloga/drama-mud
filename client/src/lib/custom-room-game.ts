import type { CharacterInfo, CustomCharacterDraft, CustomGameDraft, GameDetail } from './api'

const CUSTOM_ROOM_GAME_KEY = 'drama-mud:web-custom-room-games'
const CUSTOM_ROOM_TEMPLATE_NAME = 'custom-room'

interface StoredCustomRoomGames {
  [roomId: string]: GameDetail
}

function isBrowserReady() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function slugify(value: string, fallback: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')

  return normalized || fallback
}

function toCharacterInfo(character: CustomCharacterDraft, index: number, isNpc: boolean): CharacterInfo {
  const fallbackId = `${isNpc ? 'npc' : 'player'}-${index + 1}`

  return {
    id: slugify(character.name, fallbackId),
    name: character.name.trim(),
    description: character.description.trim(),
    personality: character.personality.trim(),
    isNpc,
  }
}

function readStoredCustomRoomGames(): StoredCustomRoomGames {
  if (!isBrowserReady()) {
    return {}
  }

  try {
    const rawValue = window.localStorage.getItem(CUSTOM_ROOM_GAME_KEY)
    if (!rawValue) {
      return {}
    }

    const parsed = JSON.parse(rawValue) as StoredCustomRoomGames
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch (error) {
    console.warn('[custom-room-game] Failed to read local custom rooms:', error)
    return {}
  }
}

function writeStoredCustomRoomGames(value: StoredCustomRoomGames) {
  if (!isBrowserReady()) {
    return
  }

  try {
    window.localStorage.setItem(CUSTOM_ROOM_GAME_KEY, JSON.stringify(value))
  } catch (error) {
    console.warn('[custom-room-game] Failed to persist local custom rooms:', error)
  }
}

export function buildCustomGameDetail(draft: CustomGameDraft): GameDetail {
  return {
    name: CUSTOM_ROOM_TEMPLATE_NAME,
    displayName: draft.title.trim(),
    type: 'custom',
    roleMode: 'custom',
    description: draft.description.trim(),
    worldMd: draft.worldMd.trim(),
    characters: [
      ...draft.playableCharacters.map((character, index) => toCharacterInfo(character, index, false)),
      ...draft.npcCharacters.map((character, index) => toCharacterInfo(character, index, true)),
    ],
  }
}

export function saveCustomRoomGame(roomId: string, game: GameDetail) {
  const next = readStoredCustomRoomGames()
  next[roomId] = game
  writeStoredCustomRoomGames(next)
}

export function getCustomRoomGame(roomId: string) {
  return readStoredCustomRoomGames()[roomId] ?? null
}

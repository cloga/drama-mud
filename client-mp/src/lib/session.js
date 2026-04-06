import Taro from '@tarojs/taro'

const PLAYER_NAME_KEY = 'drama-mud:player-name'
const ACTIVE_SESSION_KEY = 'drama-mud:active-session'

function readStorage(key) {
  try {
    const value = Taro.getStorageSync(key)
    return value || null
  } catch (error) {
    console.warn(`[storage] Failed to read ${key}:`, error)
    return null
  }
}

export function getStoredPlayerName() {
  return readStorage(PLAYER_NAME_KEY) ?? ''
}

export function setStoredPlayerName(playerName) {
  const value = playerName.trim()
  if (!value) {
    Taro.removeStorageSync(PLAYER_NAME_KEY)
    return
  }
  Taro.setStorageSync(PLAYER_NAME_KEY, value)
}

export function getStoredSession() {
  const session = readStorage(ACTIVE_SESSION_KEY)
  if (!session) return null
  if (!session.roomId || !session.playerName) {
    console.warn('[storage] Discarding incomplete stored session')
    Taro.removeStorageSync(ACTIVE_SESSION_KEY)
    return null
  }
  return session
}

export function setStoredSession(session) {
  Taro.setStorageSync(ACTIVE_SESSION_KEY, session)
}

export function clearStoredSession() {
  Taro.removeStorageSync(ACTIVE_SESSION_KEY)
}

import Taro from '@tarojs/taro'
import { formatApiError } from './network-errors'

const API_BASE = (TARO_APP_API_URL ?? 'http://localhost:3001').replace(/\/$/, '')

async function request(path, method = 'GET', data) {
  let res

  try {
    res = await Taro.request({
      url: `${API_BASE}${path}`,
      method,
      data,
      header: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    throw formatApiError(API_BASE, error)
  }

  if (res.statusCode < 200 || res.statusCode >= 300) {
    throw new Error(res.data?.error ?? `请求失败：${res.statusCode}`)
  }

  return res.data
}

function isNotFoundError(error) {
  return error instanceof Error && error.message.includes('404')
}

async function requestRoomGame(roomId) {
  try {
    return await request(`/api/rooms/${roomId}/game`)
  } catch (error) {
    if (!isNotFoundError(error)) {
      throw error
    }
  }

  return request(`/api/rooms/${roomId}/game-detail`)
}

async function getRoomGameDetail(roomId, fallbackTemplateName) {
  try {
    return await requestRoomGame(roomId)
  } catch (error) {
    if (!fallbackTemplateName || !isNotFoundError(error)) {
      throw error
    }

    return request(`/api/games/${fallbackTemplateName}`)
  }
}

export const api = {
  getGames: () => request('/api/games'),
  getGame: (name) => request(`/api/games/${name}`),
  getRoomGameDetail,
  createRoom: (gameTemplate, hostName, npcBackend = 'agent-runtime') =>
    request('/api/rooms', 'POST', { gameTemplate, hostName, npcBackend }),
  getRoom: (roomId) => request(`/api/rooms/${roomId}`),
  getRoomMessages: (roomId) => request(`/api/rooms/${roomId}/messages`),
}

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

export const api = {
  getGames: () => request('/api/games'),
  getGame: (name) => request(`/api/games/${name}`),
  createRoom: (gameTemplate, hostName) =>
    request('/api/rooms', 'POST', { gameTemplate, hostName }),
  getRoom: (roomId) => request(`/api/rooms/${roomId}`),
}

import { api, type GameDetail } from './api.js'
import { getCustomRoomGame } from './custom-room-game.js'

export async function loadEffectiveRoomGame(roomId: string, fallbackTemplateName?: string): Promise<GameDetail> {
  try {
    return await api.getRoomGameDetail(roomId, fallbackTemplateName)
  } catch (roomError) {
    const customRoomGame = getCustomRoomGame(roomId)
    if (customRoomGame) {
      return customRoomGame
    }

    throw roomError
  }
}

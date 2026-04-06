import { describe, expect, it } from 'vitest'
import { buildRouteUrl, parseRouteLocation, resolveRouteState } from './routes.js'

describe('routes', () => {
  it('builds explicit lobby and room urls', () => {
    expect(buildRouteUrl('lobby', {})).toBe('/lobby')
    expect(
      buildRouteUrl('character-select', {
        roomId: 'room-1',
        templateName: 'campus',
        playerName: '阿青',
      }),
    ).toBe('/rooms/room-1/characters?template=campus&player=%E9%98%BF%E9%9D%92')
    expect(
      buildRouteUrl('game', {
        roomId: 'room 1',
        templateName: 'campus',
        templateDisplayName: '校园',
        playerName: '阿青',
        characterId: 'lead',
      }),
    ).toBe(
      '/rooms/room%201/chat?template=campus&title=%E6%A0%A1%E5%9B%AD&player=%E9%98%BF%E9%9D%92&character=lead',
    )
  })

  it('parses pathname-based routes', () => {
    expect(
      parseRouteLocation({
        pathname: '/rooms/room-1/chat',
        search: '?template=campus&title=%E6%A0%A1%E5%9B%AD&player=%E9%98%BF%E9%9D%92&character=lead',
      }),
    ).toEqual({
      view: 'game',
      gameState: {
        roomId: 'room-1',
        templateName: 'campus',
        templateDisplayName: '校园',
        playerName: '阿青',
        characterId: 'lead',
      },
    })
  })

  it('keeps legacy hash routes readable', () => {
    expect(
      parseRouteLocation({
        pathname: '/not-a-route',
        hash: '#/rooms/room-2/characters?template=campus&player=%E6%99%9A%E9%A3%8E',
      }),
    ).toEqual({
      view: 'character-select',
      gameState: {
        roomId: 'room-2',
        templateName: 'campus',
        playerName: '晚风',
      },
    })
  })

  it('fills character-select state from persisted room history', () => {
    expect(
      resolveRouteState(
        {
          view: 'character-select',
          gameState: { roomId: 'room-3' },
        },
        [
          {
            roomId: 'room-3',
            templateName: 'campus',
            templateDisplayName: '校园',
            playerName: '小林',
            firstPlayedAt: 1,
            lastPlayedAt: 2,
          },
        ],
      ),
    ).toEqual({
      view: 'character-select',
      gameState: {
        roomId: 'room-3',
        templateName: 'campus',
        templateDisplayName: '校园',
        playerName: '小林',
      },
    })
  })

  it('downgrades chat routes without a persisted character to character-select', () => {
    expect(
      resolveRouteState(
        {
          view: 'game',
          gameState: {
            roomId: 'room-4',
            templateName: 'campus',
            playerName: '小林',
          },
        },
        [
          {
            roomId: 'room-4',
            templateName: 'campus',
            playerName: '小林',
            firstPlayedAt: 1,
            lastPlayedAt: 2,
          },
        ],
      ),
    ).toEqual({
      view: 'character-select',
      gameState: {
        roomId: 'room-4',
        templateName: 'campus',
        playerName: '小林',
      },
    })
  })
})

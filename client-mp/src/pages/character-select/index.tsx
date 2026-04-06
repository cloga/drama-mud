// @ts-nocheck
import React, { useEffect, useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import { api } from '../../lib/api'
import { getStoredSession, setStoredSession } from '../../lib/session'
import './index.css'

export default function CharacterSelect() {
  const h = React.createElement
  const router = useRouter()
  const storedSession = getStoredSession()
  const routeParams = router.params || {}
  const roomId = routeParams.roomId || storedSession?.roomId || ''
  const templateName = routeParams.templateName || storedSession?.templateName || ''
  const encodedPlayerName = routeParams.playerName || encodeURIComponent(storedSession?.playerName || '')
  const decodedPlayerName = decodeURIComponent(encodedPlayerName || '')

  const [characters, setCharacters] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!roomId || !templateName || !decodedPlayerName) {
      setError('缺少房间、玩家或模板信息，请返回大厅重试。')
      setLoading(false)
      return
    }

    setStoredSession({
      roomId,
      templateName,
      playerName: decodedPlayerName,
      characterId: storedSession?.characterId,
    })

    api
      .getGame(templateName)
      .then((game) => {
        setCharacters(game.characters)
        setLoading(false)
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err))
        setLoading(false)
      })
  }, [decodedPlayerName, roomId, storedSession?.characterId, templateName])

  const handleSelect = (characterId) => {
    setStoredSession({
      roomId,
      templateName,
      playerName: decodedPlayerName,
      characterId,
    })

    Taro.navigateTo({
      url: `/pages/chat/index?roomId=${roomId}&playerName=${encodeURIComponent(decodedPlayerName)}&characterId=${characterId}`,
    })
  }

  if (loading) {
    return h(View, { className: 'select-page' }, h(Text, null, '正在加载角色...'))
  }
  if (error) {
    return h(View, { className: 'select-page' }, h(Text, { className: 'error-text' }, `出错了：${error}`))
  }

  const playable = characters.filter((character) => !character.isNpc)
  const npcs = characters.filter((character) => character.isNpc)

  return h(
    View,
    { className: 'select-page' },
    h(Text, { className: 'page-subtitle', key: 'subtitle' }, `房间：${roomId?.slice(0, 16)}... | 玩家：${decodedPlayerName}`),
    h(Text, { className: 'section-title', key: 'playable-title' }, '可扮演角色'),
    h(Text, { className: 'section-hint', key: 'playable-hint' }, '点击角色即可进入游戏。'),
    ...playable.map((character) =>
      h(
        View,
        {
          key: character.id,
          className: 'char-card char-card--playable',
          onClick: () => handleSelect(character.id),
        },
        h(Text, { className: 'char-name' }, `🎭 ${character.name}`),
        h(Text, { className: 'char-desc' }, character.description),
        h(Text, { className: 'char-personality' }, character.personality),
      ),
    ),
    ...(npcs.length > 0
      ? [
          h(
            Text,
            {
              className: 'section-title',
              style: { marginTop: '32px' },
              key: 'npc-title',
            },
            'NPC 角色（AI 控制）',
          ),
          ...npcs.map((character) =>
            h(
              View,
              {
                key: character.id,
                className: 'char-card char-card--npc',
              },
              h(Text, { className: 'char-name' }, `🤖 ${character.name}`),
              h(Text, { className: 'char-desc' }, character.description),
              h(Text, { className: 'char-personality' }, character.personality),
            ),
          ),
        ]
      : []),
  )
}

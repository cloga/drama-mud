// @ts-nocheck
import React, { useEffect, useState } from 'react'
import { View, Text, Input, Button } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { api } from '../../lib/api'
import {
  clearStoredSession,
  getStoredPlayerName,
  getStoredSession,
  setStoredPlayerName,
  setStoredSession,
} from '../../lib/session'
import './index.css'

export default function Lobby() {
  const h = React.createElement
  const [games, setGames] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [hostName, setHostName] = useState(() => getStoredPlayerName())
  const [selectedGame, setSelectedGame] = useState(null)
  const [npcBackend, setNpcBackend] = useState('agent-runtime')
  const [creating, setCreating] = useState(false)
  const [resumeSession, setResumeSession] = useState(() => getStoredSession())

  useEffect(() => {
    api
      .getGames()
      .then(({ games: list }) => {
        setGames(list)
        setLoading(false)
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err))
        setLoading(false)
      })
  }, [])

  useEffect(() => {
    setStoredPlayerName(hostName)
  }, [hostName])

  useDidShow(() => {
    setResumeSession(getStoredSession())
    setHostName(getStoredPlayerName())
  })

  const handleCreate = async () => {
    if (!selectedGame || !hostName.trim()) return
    setCreating(true)
    const playerName = hostName.trim()
    try {
      const { room } = await api.createRoom(selectedGame, playerName, npcBackend)
      const session = {
        roomId: room.id,
        templateName: selectedGame,
        playerName,
        npcBackend: room.npcBackend || npcBackend,
      }
      setStoredSession(session)
      setResumeSession(session)
      Taro.navigateTo({
        url: `/pages/character-select/index?roomId=${room.id}&templateName=${selectedGame}&playerName=${encodeURIComponent(playerName)}`,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setCreating(false)
    }
  }

  const handleResume = () => {
    if (!resumeSession) return

    if (resumeSession.characterId) {
      Taro.navigateTo({
        url: `/pages/chat/index?roomId=${resumeSession.roomId}&playerName=${encodeURIComponent(resumeSession.playerName)}&characterId=${resumeSession.characterId}`,
      })
      return
    }

    if (resumeSession.templateName) {
      Taro.navigateTo({
        url: `/pages/character-select/index?roomId=${resumeSession.roomId}&templateName=${resumeSession.templateName}&playerName=${encodeURIComponent(resumeSession.playerName)}`,
      })
      return
    }

    clearStoredSession()
    setResumeSession(null)
    setError('上次会话信息不完整，请重新创建房间。')
  }

  if (loading) {
    return h(View, { className: 'lobby' }, h(Text, null, '正在加载游戏模板...'))
  }

  const fixedGames = games.filter((game) => game.roleMode === 'fixed')

  return h(
    View,
    { className: 'lobby' },
    error
      ? h(
          View,
          { className: 'section', key: 'error' },
          h(Text, { className: 'error-text' }, `出错了：${error}`),
        )
      : null,
    h(
      View,
      { className: 'section', key: 'name-section' },
      h(Text, { className: 'section-title' }, '你的名字'),
      h(Input, {
        className: 'name-input',
        value: hostName,
        onInput: (e) => setHostName(e.detail.value),
        placeholder: '请输入你的名字',
      }),
    ),
    h(
      View,
      { className: 'section', key: 'backend-section' },
      h(Text, { className: 'section-title' }, 'NPC 响应路径'),
      h(
        View,
        { className: 'backend-switch' },
        h(
          View,
          {
            className: `backend-card ${npcBackend === 'agent-runtime' ? 'backend-card--selected' : ''}`,
            onClick: () => setNpcBackend('agent-runtime'),
          },
          h(Text, { className: 'backend-name' }, 'Agent Runtime'),
          h(Text, { className: 'backend-desc' }, '走当前 runtime/sync 链路，适合和直连 LLM 对比。'),
        ),
        h(
          View,
          {
            className: `backend-card ${npcBackend === 'llm' ? 'backend-card--selected' : ''}`,
            onClick: () => setNpcBackend('llm'),
          },
          h(Text, { className: 'backend-name' }, '直连 LLM'),
          h(Text, { className: 'backend-desc' }, '直接走 LLM 接口，默认模型 doubao-seed-1-6-flash-250828。'),
        ),
      ),
    ),
    h(
      View,
      { className: 'section', key: 'templates-section' },
      h(Text, { className: 'section-title' }, '可选模板'),
      ...fixedGames.map((game) =>
        h(
          View,
          {
            key: game.name,
            className: `game-card ${selectedGame === game.name ? 'game-card--selected' : ''}`,
            onClick: () => setSelectedGame(game.name),
          },
          h(Text, { className: 'game-name' }, game.displayName),
          h(Text, { className: 'game-desc' }, game.description),
          h(
            Text,
            { className: 'game-meta' },
              `${game.characters.filter((character) => !character.isNpc).length} 个可扮演角色 / ${game.characters.filter((character) => character.isNpc).length} 个 NPC`,
          ),
        ),
      ),
    ),
    resumeSession
      ? h(
          Button,
          { onClick: handleResume, key: 'resume-button' },
          '继续上次会话',
        )
      : null,
    h(
      Button,
      {
        className: 'create-btn',
        onClick: handleCreate,
        disabled: !selectedGame || !hostName.trim() || creating,
        key: 'create-button',
      },
      creating ? '创建中...' : '创建房间',
    ),
  )
}

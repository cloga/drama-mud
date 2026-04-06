import { useEffect, useState } from 'react'
import { api, type GameInfo } from '../lib/api.js'

interface GameLobbyProps {
  onRoomCreated: (roomId: string, templateName: string, playerName: string) => void
}

export function GameLobby({ onRoomCreated }: GameLobbyProps) {
  const [games, setGames] = useState<GameInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hostName, setHostName] = useState('')
  const [selectedGame, setSelectedGame] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    api
      .getGames()
      .then(({ games }) => {
        setGames(games)
        setLoading(false)
      })
      .catch((err) => {
        setError(String(err))
        setLoading(false)
      })
  }, [])

  const handleCreate = async () => {
    if (!selectedGame || !hostName.trim()) return
    setCreating(true)
    try {
      const { room } = await api.createRoom(selectedGame, hostName.trim())
      onRoomCreated(room.id, selectedGame, hostName.trim())
    } catch (err) {
      setError(String(err))
      setCreating(false)
    }
  }

  if (loading) return <p>正在加载游戏模板...</p>
  if (error) return <p style={{ color: '#ff5252' }}>出错了：{error}</p>

  return (
    <div>
      <h2>游戏大厅</h2>
      <p>选择一个游戏模板，并输入你的名字来创建房间。</p>

      <div style={{ marginTop: 16 }}>
        <label>
          你的名字：{' '}
          <input
            value={hostName}
            onChange={(e) => setHostName(e.target.value)}
            placeholder="请输入你的名字"
            style={{ padding: 6, fontFamily: 'monospace' }}
          />
        </label>
      </div>

      <div style={{ marginTop: 16 }}>
        <h3>可选模板</h3>
        {games
          .filter((g) => g.roleMode === 'fixed')
          .map((game) => (
            <div
              key={game.name}
              onClick={() => setSelectedGame(game.name)}
              style={{
                border: `2px solid ${selectedGame === game.name ? '#4fc3f7' : '#555'}`,
                borderRadius: 8,
                padding: 12,
                marginBottom: 8,
                cursor: 'pointer',
                background: selectedGame === game.name ? '#1a2a3a' : '#1a1a1a',
              }}
            >
              <strong>{game.displayName}</strong>
              <p style={{ margin: '4px 0 0', color: '#aaa', fontSize: 13 }}>{game.description}</p>
              <p style={{ margin: '4px 0 0', color: '#777', fontSize: 12 }}>
                {game.characters.filter((c) => !c.isNpc).length} 个可扮演角色 /{' '}
                {game.characters.filter((c) => c.isNpc).length} 个 NPC
              </p>
            </div>
          ))}
      </div>

      <button
        onClick={handleCreate}
        disabled={!selectedGame || !hostName.trim() || creating}
        style={{
          marginTop: 16,
          padding: '10px 24px',
          fontSize: 16,
          cursor: selectedGame && hostName.trim() ? 'pointer' : 'not-allowed',
          opacity: selectedGame && hostName.trim() ? 1 : 0.5,
        }}
      >
        {creating ? '创建中...' : '创建房间'}
      </button>
    </div>
  )
}

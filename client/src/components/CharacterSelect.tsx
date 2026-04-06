import { useEffect, useState } from 'react'
import { api, type CharacterInfo } from '../lib/api.js'
import { CharacterCard } from './CharacterCard.js'

interface CharacterSelectProps {
  roomId: string
  templateName: string
  playerName: string
  onSelect: (characterId: string) => void
  onBack: () => void
}

export function CharacterSelect({ roomId, templateName, playerName, onSelect, onBack }: CharacterSelectProps) {
  const [characters, setCharacters] = useState<CharacterInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .getGame(templateName)
      .then((game) => {
        setCharacters(game.characters)
        setLoading(false)
      })
      .catch((err) => {
        setError(String(err))
        setLoading(false)
      })
  }, [templateName])

  if (loading) return <p>正在加载角色...</p>
  if (error) return <p style={{ color: '#ff5252' }}>出错了：{error}</p>

  const playable = characters.filter((c) => !c.isNpc)
  const npcs = characters.filter((c) => c.isNpc)

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>选择你的角色</h2>
        <button onClick={onBack}>返回</button>
      </div>
      <p style={{ color: '#aaa' }}>
        房间：<code>{roomId}</code> | 玩家：<strong>{playerName}</strong>
      </p>

      <h3>可扮演角色</h3>
      <p style={{ color: '#888', fontSize: 13 }}>点击角色即可进入游戏。</p>
      {playable.map((c) => (
        <CharacterCard
          key={c.id}
          name={c.name}
          description={c.description}
          personality={c.personality}
          isNpc={false}
          onSelect={() => onSelect(c.id)}
        />
      ))}

      {npcs.length > 0 && (
        <>
          <h3 style={{ marginTop: 24 }}>NPC 角色（AI 控制）</h3>
          {npcs.map((c) => (
            <CharacterCard
              key={c.id}
              name={c.name}
              description={c.description}
              personality={c.personality}
              isNpc={true}
            />
          ))}
        </>
      )}
    </div>
  )
}

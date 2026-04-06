import { useEffect, useMemo, useState } from 'react'
import type { GameDetail } from '../lib/api'
import { loadEffectiveGame, parseWorldMarkdown, renderInlineMarkdown } from '../lib/story-guide.js'
import { CharacterCard } from './CharacterCard.js'
import './CharacterSelect.css'

interface RoomStoryPanelProps {
  roomId: string
  templateName?: string
  templateDisplayName?: string
  currentCharacterId: string
}

export function RoomStoryPanel({
  roomId,
  templateName,
  templateDisplayName,
  currentCharacterId,
}: RoomStoryPanelProps) {
  const [game, setGame] = useState<GameDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    setLoading(true)
    setError(null)

    loadEffectiveGame(roomId, templateName)
      .then((gameData) => {
        if (!active) {
          return
        }

        setGame(gameData)
        setLoading(false)
      })
      .catch((err) => {
        if (!active) {
          return
        }

        setError(String(err))
        setLoading(false)
      })

    return () => {
      active = false
    }
  }, [roomId, templateName])

  const characters = game?.characters ?? []
  const playable = characters.filter((character) => !character.isNpc)
  const npcs = characters.filter((character) => character.isNpc)
  const currentCharacter = characters.find((character) => character.id === currentCharacterId)
  const introBlocks = useMemo(() => parseWorldMarkdown(game?.worldMd ?? ''), [game?.worldMd])
  const titleBlock = introBlocks.find((block) => block.type === 'title')
  const resolvedDisplayName = game?.displayName ?? templateDisplayName ?? templateName ?? '当前剧本'
  const introTitle = titleBlock && 'content' in titleBlock ? titleBlock.content : resolvedDisplayName
  const introContent = introBlocks.filter((block) => block.type !== 'title')

  if (loading) {
    return (
      <section className="character-select character-select--status">
        <div className="character-select__status-panel">
          <p className="character-select__status">正在加载本局的背景与角色资料...</p>
        </div>
      </section>
    )
  }

  if (error) {
    return (
      <section className="character-select character-select--status">
        <div className="character-select__status-panel">
          <p className="character-select__error">加载失败：{error}</p>
        </div>
      </section>
    )
  }

  return (
    <section className="character-select">
      <section className="character-select__panel">
        <div className="character-select__section-header">
          <div>
            <p className="character-select__section-eyebrow">房间内快捷查看</p>
            <h3 className="character-select__section-title">故事背景与角色</h3>
            <p className="character-select__section-caption">
              不离开房间，也能随时回看设定、人物关系和当前可见角色信息。
            </p>
          </div>
          <span className="character-select__section-meta">{characters.length} 位角色</span>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 16 }}>
          <span className="character-select__meta-pill">剧本：{resolvedDisplayName}</span>
          {currentCharacter && <span className="character-select__meta-pill">当前扮演：{currentCharacter.name}</span>}
        </div>
      </section>

      {(introContent.length > 0 || game?.worldMd.trim()) && (
        <section className="character-select__panel character-select__panel--intro">
          <div className="character-select__section-header">
            <div>
              <p className="character-select__section-eyebrow">剧本背景</p>
              <h3 className="character-select__section-title">{introTitle}</h3>
            </div>
            <span className="character-select__section-meta">开场导读</span>
          </div>

          <div className="character-select__intro">
            {introContent.length > 0 ? (
              introContent.map((block, index) => {
                switch (block.type) {
                  case 'heading':
                    return (
                      <h4 key={`${block.type}-${index}`} className="character-select__intro-heading">
                        {block.content}
                      </h4>
                    )
                  case 'paragraph':
                    return (
                      <p key={`${block.type}-${index}`} className="character-select__intro-paragraph">
                        {renderInlineMarkdown(block.content)}
                      </p>
                    )
                  case 'quote':
                    return (
                      <blockquote key={`${block.type}-${index}`} className="character-select__intro-quote">
                        {renderInlineMarkdown(block.content)}
                      </blockquote>
                    )
                  case 'list':
                    return (
                      <ul key={`${block.type}-${index}`} className="character-select__intro-list">
                        {block.items.map((item, itemIndex) => (
                          <li key={`${item}-${itemIndex}`}>{renderInlineMarkdown(item)}</li>
                        ))}
                      </ul>
                    )
                }
              })
            ) : (
              <p className="character-select__intro-paragraph">{game?.description ?? '暂无剧本背景介绍。'}</p>
            )}
          </div>
        </section>
      )}

      <section className="character-select__panel">
        <div className="character-select__section-header">
          <div>
            <h3 className="character-select__section-title">可扮演角色</h3>
            <p className="character-select__section-caption">当前可由玩家扮演的角色资料。</p>
          </div>
          <span className="character-select__section-meta">{playable.length} 位</span>
        </div>

        <div className="character-select__cards">
          {playable.map((character) => (
            <CharacterCard
              key={character.id}
              name={character.name}
              description={character.description}
              personality={character.personality}
              isNpc={false}
            />
          ))}
        </div>
      </section>

      {npcs.length > 0 && (
        <section className="character-select__panel">
          <div className="character-select__section-header">
            <div>
              <h3 className="character-select__section-title">NPC 角色</h3>
              <p className="character-select__section-caption">这些角色仍由 AI 接管，但你可以随时回看设定。</p>
            </div>
            <span className="character-select__section-meta">{npcs.length} 位</span>
          </div>

          <div className="character-select__cards">
            {npcs.map((character) => (
              <CharacterCard
                key={character.id}
                name={character.name}
                description={character.description}
                personality={character.personality}
                isNpc={true}
              />
            ))}
          </div>
        </section>
      )}
    </section>
  )
}

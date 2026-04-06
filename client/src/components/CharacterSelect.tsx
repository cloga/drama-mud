import { useEffect, useMemo, useState } from 'react'
import type { GameDetail } from '../lib/api'
import { loadEffectiveGame, parseWorldMarkdown, renderInlineMarkdown } from '../lib/story-guide.js'
import { CharacterCard } from './CharacterCard.js'
import './CharacterSelect.css'

interface CharacterSelectProps {
  roomId: string
  templateName: string
  templateDisplayName?: string
  playerName: string
  onSelect: (characterId: string) => void
  onBack: () => void
}

export function CharacterSelect({
  roomId,
  templateName,
  templateDisplayName,
  playerName,
  onSelect,
  onBack,
}: CharacterSelectProps) {
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
  const introBlocks = useMemo(() => parseWorldMarkdown(game?.worldMd ?? ''), [game?.worldMd])
  const titleBlock = introBlocks.find((block) => block.type === 'title')
  const resolvedDisplayName = game?.displayName ?? templateDisplayName ?? templateName
  const introTitle = titleBlock && 'content' in titleBlock ? titleBlock.content : (resolvedDisplayName ?? '故事导览')
  const introContent = introBlocks.filter((block) => block.type !== 'title')

  if (loading) {
    return (
      <section className="character-select character-select--status">
        <div className="character-select__status-panel">
          <p className="character-select__status">正在加载这局房间的背景与角色列表...</p>
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
      <header className="character-select__hero">
        <div className="character-select__hero-main">
          <p className="character-select__eyebrow">先读背景，再选身份</p>
          <h2 className="character-select__title">进入房间前，先沉浸在故事里</h2>
          <p className="character-select__subtitle">
            {game?.description || '剧本背景会先带你进入氛围，再从下方挑一个角色开始表演。'}
          </p>
          <div className="character-select__meta">
            <span className="character-select__meta-pill">房间：{roomId}</span>
            <span className="character-select__meta-pill">玩家：{playerName}</span>
            <span className="character-select__meta-pill">剧本：{resolvedDisplayName}</span>
          </div>
        </div>

        <button type="button" className="character-select__back-button" onClick={onBack}>
          返回重选剧本
        </button>
      </header>

      {(introContent.length > 0 || game?.worldMd.trim()) && (
        <section className="character-select__panel character-select__panel--intro">
          <div className="character-select__section-header">
            <div>
              <p className="character-select__section-eyebrow">剧本背景</p>
              <h3 className="character-select__section-title">{introTitle}</h3>
              <p className="character-select__section-caption">花半分钟读完背景，选角时会更有代入感。</p>
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
            <p className="character-select__section-caption">点击任意角色即可进入游戏。</p>
          </div>
          <span className="character-select__section-meta">{playable.length} 位待选</span>
        </div>

        <div className="character-select__cards">
          {playable.map((character) => (
            <CharacterCard
              key={character.id}
              name={character.name}
              description={character.description}
              personality={character.personality}
              isNpc={false}
              onSelect={() => onSelect(character.id)}
            />
          ))}
        </div>
      </section>

      {npcs.length > 0 && (
        <section className="character-select__panel">
          <div className="character-select__section-header">
            <div>
              <h3 className="character-select__section-title">NPC 角色</h3>
              <p className="character-select__section-caption">这些角色会由 AI 接管，协助推进剧情。</p>
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

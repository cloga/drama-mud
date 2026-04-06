interface CharacterCardProps {
  name: string
  description: string
  personality: string
  isNpc: boolean
  onSelect?: () => void
}

export function CharacterCard({ name, description, personality, isNpc, onSelect }: CharacterCardProps) {
  const className = [
    'character-card',
    isNpc ? 'character-card--npc' : 'character-card--player',
    onSelect ? 'character-card--selectable' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const content = (
    <>
      <div className="character-card__header">
        <h3 className="character-card__title">
          {isNpc ? '🤖' : '🎭'} {name}
        </h3>
        <span className={`character-card__tag ${isNpc ? 'character-card__tag--npc' : 'character-card__tag--player'}`}>
          {isNpc ? 'AI 控制' : '可扮演'}
        </span>
      </div>
      <p className="character-card__description">{description}</p>
      <p className="character-card__personality">性格：{personality}</p>
    </>
  )

  if (onSelect) {
    return (
      <button type="button" className={className} onClick={onSelect}>
        {content}
      </button>
    )
  }

  return <article className={className}>{content}</article>
}

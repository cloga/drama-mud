interface CharacterCardProps {
  name: string
  description: string
  personality: string
  isNpc: boolean
  onSelect?: () => void
}

export function CharacterCard({ name, description, personality, isNpc, onSelect }: CharacterCardProps) {
  return (
    <div
      style={{
        border: '1px solid #555',
        borderRadius: 8,
        padding: 16,
        marginBottom: 12,
        cursor: onSelect ? 'pointer' : 'default',
        background: isNpc ? '#2a1a1a' : '#1a2a1a',
      }}
      onClick={onSelect}
    >
      <h3 style={{ margin: '0 0 8px' }}>
        {isNpc ? '🤖' : '🎭'} {name}
      </h3>
      <p style={{ margin: '0 0 4px', color: '#bbb' }}>{description}</p>
      <p style={{ margin: 0, fontSize: 12, color: '#888' }}>性格：{personality}</p>
    </div>
  )
}

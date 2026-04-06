import { useState } from 'react'
import { GameLobby } from './components/GameLobby.js'
import { CharacterSelect } from './components/CharacterSelect.js'
import { ChatPanel } from './components/ChatPanel.js'

type View = 'lobby' | 'character-select' | 'game'

interface GameState {
  roomId: string
  templateName: string
  playerName: string
  characterId: string
}

export function App() {
  const [view, setView] = useState<View>('lobby')
  const [gameState, setGameState] = useState<Partial<GameState>>({})

  const handleRoomCreated = (roomId: string, templateName: string, playerName: string) => {
    setGameState({ roomId, templateName, playerName })
    setView('character-select')
  }

  const handleCharacterSelected = (characterId: string) => {
    setGameState((prev) => ({ ...prev, characterId }))
    setView('game')
  }

  const handleBackToLobby = () => {
    setGameState({})
    setView('lobby')
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: 20, fontFamily: 'monospace' }}>
      <h1>戏精日记</h1>

      {view === 'lobby' && <GameLobby onRoomCreated={handleRoomCreated} />}

      {view === 'character-select' && gameState.roomId && gameState.templateName && gameState.playerName && (
        <CharacterSelect
          roomId={gameState.roomId}
          templateName={gameState.templateName}
          playerName={gameState.playerName}
          onSelect={handleCharacterSelected}
          onBack={handleBackToLobby}
        />
      )}

      {view === 'game' && gameState.roomId && gameState.playerName && gameState.characterId && (
        <ChatPanel
          roomId={gameState.roomId}
          playerName={gameState.playerName}
          characterId={gameState.characterId}
          onLeave={handleBackToLobby}
        />
      )}
    </div>
  )
}

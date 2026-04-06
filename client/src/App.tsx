import { useEffect, useState } from 'react'
import './app.css'
import { GameLobby } from './components/GameLobby.js'
import { CharacterSelect } from './components/CharacterSelect.js'
import { ChatPanel } from './components/ChatPanel.js'
import {
  clearRoomHistoryCharacter,
  type RoomHistoryEntry,
  upsertRoomHistory,
} from './lib/room-history.js'
import {
  pushRouteState,
  readRouteState,
  replaceRouteState,
  type RouteGameState,
  type View,
} from './lib/routes.js'

const shellMeta: Record<View, { badge: string; subtitle: string }> = {
  lobby: {
    badge: '第 1 步 / 创建或继续',
    subtitle: '像聊天首页一样快速开房或续玩',
  },
  'character-select': {
    badge: '第 2 步 / 选择角色',
    subtitle: '选一个身份进入故事',
  },
  game: {
    badge: '进行中',
    subtitle: '房间进行中',
  },
}

export function App() {
  const initialRoute = readRouteState()
  const [view, setView] = useState<View>(initialRoute.view)
  const [gameState, setGameState] = useState<Partial<RouteGameState>>(initialRoute.gameState)

  const applyRoute = (nextView: View, nextGameState: Partial<RouteGameState>, mode: 'push' | 'replace' = 'push') => {
    setView(nextView)
    setGameState(nextGameState)

    if (mode === 'replace') {
      replaceRouteState(nextView, nextGameState)
      return
    }

    pushRouteState(nextView, nextGameState)
  }

  useEffect(() => {
    const syncFromLocation = () => {
      const nextRoute = readRouteState()
      applyRoute(nextRoute.view, nextRoute.gameState, 'replace')
    }

    syncFromLocation()
    window.addEventListener('popstate', syncFromLocation)
    window.addEventListener('hashchange', syncFromLocation)
    return () => {
      window.removeEventListener('popstate', syncFromLocation)
      window.removeEventListener('hashchange', syncFromLocation)
    }
  }, [])

  const handleRoomCreated = (
    roomId: string,
    templateName: string,
    playerName: string,
    templateDisplayName?: string,
    npcBackend?: 'agent-runtime' | 'llm',
  ) => {
    upsertRoomHistory({ roomId, templateName, templateDisplayName, npcBackend, playerName })
    applyRoute('character-select', { roomId, templateName, templateDisplayName, playerName })
  }

  const handleCharacterSelected = (characterId: string) => {
    if (gameState.roomId && gameState.templateName && gameState.playerName) {
      upsertRoomHistory({
        roomId: gameState.roomId,
        templateName: gameState.templateName,
        templateDisplayName: gameState.templateDisplayName,
        playerName: gameState.playerName,
        characterId,
      })
    }

    if (!gameState.roomId || !gameState.templateName || !gameState.playerName) {
      applyRoute('lobby', {})
      return
    }

    applyRoute('game', { ...gameState, characterId })
  }

  const handleResumeRoom = (room: RoomHistoryEntry) => {
    upsertRoomHistory(room)
      const nextGameState: Partial<RouteGameState> = {
        roomId: room.roomId,
        templateName: room.templateName,
        templateDisplayName: room.templateDisplayName,
        playerName: room.playerName,
      ...(room.characterId ? { characterId: room.characterId } : {}),
    }
    applyRoute(room.characterId ? 'game' : 'character-select', nextGameState)
  }

  const handleRetryCharacterSelect = () => {
    if (gameState.roomId) {
      clearRoomHistoryCharacter(gameState.roomId)
    }

    if (!gameState.roomId || !gameState.templateName || !gameState.playerName) {
      applyRoute('lobby', {})
      return
    }

    applyRoute('character-select', {
      roomId: gameState.roomId,
      templateName: gameState.templateName,
      templateDisplayName: gameState.templateDisplayName,
      playerName: gameState.playerName,
    })
  }

  const handleBackToLobby = () => {
    applyRoute('lobby', {})
  }

  return (
    <div className="app-page">
      <div className={`app-shell app-shell--${view}`}>
        <header className="app-shell__header">
          <div className="app-shell__brand">
            <div className="app-shell__brand-mark" aria-hidden="true">
              <span />
              <span />
            </div>
            <div className="app-shell__brand-copy">
              <h1 className="app-shell__title">戏精日记</h1>
              <p className="app-shell__subtitle">{shellMeta[view].subtitle}</p>
            </div>
          </div>
          <div className="app-shell__header-badge">{shellMeta[view].badge}</div>
        </header>

        <main className={`app-shell__content app-shell__content--${view}`}>
          {view === 'lobby' ? (
            <div className="app-shell__lobby">
              <div className="app-shell__view app-shell__view--lobby">
                <GameLobby onRoomCreated={handleRoomCreated} onResumeRoom={handleResumeRoom} />
              </div>
            </div>
          ) : (
            <div className={`app-shell__phone app-shell__phone--${view}`}>
              <div className={`app-shell__view app-shell__view--${view}`}>
                {view === 'character-select' && gameState.roomId && gameState.templateName && gameState.playerName && (
                  <CharacterSelect
                    roomId={gameState.roomId}
                    templateName={gameState.templateName}
                    templateDisplayName={gameState.templateDisplayName}
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
                    templateName={gameState.templateName}
                    templateDisplayName={gameState.templateDisplayName}
                    onLeave={handleBackToLobby}
                    onRetryCharacterSelect={handleRetryCharacterSelect}
                  />
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
